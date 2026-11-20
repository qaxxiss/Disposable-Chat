const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { MongoClient } = require("mongodb");
const { Server } = require("socket.io");
const rateLimit = require("express-rate-limit");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false }, maxHttpBufferSize: 16_000 });
app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/api/", rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }));

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGODB_URI;
const ROOM_TTL_MS = 60 * 60 * 1000;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
let rooms, messages;

function makeCode() {
  let out = "";
  for (let i = 0; i < 8; i++) out += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  return out;
}
function safeName(value) {
  return String(value || "Guest").trim().replace(/[<>\u0000-\u001f]/g, "").slice(0, 24) || "Guest";
}
async function getActiveRoom(code) {
  const room = await rooms.findOne({ code });
  if (!room || room.expiresAt <= new Date()) {
    if (room) { await rooms.deleteOne({ _id: room._id }); await messages.deleteMany({ roomCode: code }); }
    return null;
  }
  return room;
}
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.post("/api/rooms", async (_req, res) => {
  try {
    let code;
    for (let i = 0; i < 5; i++) {
      code = makeCode();
      if (!(await rooms.findOne({ code }))) break;
    }
    const expiresAt = new Date(Date.now() + ROOM_TTL_MS);
    await rooms.insertOne({ code, createdAt: new Date(), expiresAt, participants: 0 });
    res.status(201).json({ code, expiresAt });
  } catch (e) { console.error(e); res.status(500).json({ error: "Could not create a room. Try again." }); }
});
app.get("/api/rooms/:code", async (req, res) => {
  const code = String(req.params.code || "").toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) return res.status(400).json({ error: "Invalid room code." });
  const room = await getActiveRoom(code);
  if (!room) return res.status(404).json({ error: "This room does not exist or has expired." });
  res.json({ code, expiresAt: room.expiresAt, participants: room.participants });
});

io.on("connection", socket => {
  socket.on("room:join", async ({ code, name } = {}, ack = () => {}) => {
    try {
      code = String(code || "").toUpperCase();
      if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) return ack({ ok: false, error: "Enter a valid 8-character code." });
      const room = await getActiveRoom(code);
      if (!room) return ack({ ok: false, error: "Room not found or expired." });
      const count = await io.in(code).fetchSockets();
      if (count.length >= 2) return ack({ ok: false, error: "This room already has two people." });
      await socket.join(code);
      await rooms.updateOne({ _id: room._id }, { $inc: { participants: 1 } });
      socket.data.roomCode = code;
      socket.data.name = safeName(name);
      const history = await messages.find({ roomCode: code, expiresAt: { $gt: new Date() } }).sort({ createdAt: 1 }).limit(100).toArray();
      ack({ ok: true, code, expiresAt: room.expiresAt, history: history.map(m => ({ id: String(m._id), name: m.name, text: m.text, createdAt: m.createdAt })) });
      socket.to(code).emit("system:notice", { text: socket.data.name + " joined the room." });
    } catch (e) { console.error(e); ack({ ok: false, error: "Unable to join. Please retry." }); }
  });
  socket.on("message:send", async ({ text } = {}, ack = () => {}) => {
    try {
      const code = socket.data.roomCode;
      if (!code) return ack({ ok: false, error: "Join a room first." });
      const room = await getActiveRoom(code);
      if (!room) { socket.leave(code); return ack({ ok: false, error: "This room has expired." }); }
      text = String(text || "").trim();
      if (!text || text.length > 2000) return ack({ ok: false, error: "Messages must be 1–2,000 characters." });
      const doc = { roomCode: code, name: socket.data.name, text, createdAt: new Date(), expiresAt: room.expiresAt };
      const result = await messages.insertOne(doc);
      io.to(code).emit("message:new", { id: String(result.insertedId), name: doc.name, text: doc.text, createdAt: doc.createdAt });
      ack({ ok: true });
    } catch (e) { console.error(e); ack({ ok: false, error: "Message could not be sent." }); }
  });
  socket.on("disconnect", async () => {
    const code = socket.data.roomCode;
    if (!code) return;
    try {
      await rooms.updateOne({ code }, { $inc: { participants: -1 } });
      socket.to(code).emit("system:notice", socket.data.name + " left the room.");
    } catch (e) { console.error(e); }
  });
});

async function start() {
  if (!MONGO_URI) throw new Error("MONGODB_URI environment variable is required");
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db("disposable_chat");
  rooms = db.collection("rooms");
  messages = db.collection("messages");
  await rooms.createIndex({ code: 1 }, { unique: true });
  await rooms.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await messages.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await messages.createIndex({ roomCode: 1, createdAt: 1 });
  server.listen(PORT, "0.0.0.0", () => console.log("Disposable Chat listening on " + PORT));
}
start().catch(err => { console.error(err); process.exit(1); });