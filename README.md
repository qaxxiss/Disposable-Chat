# AfterTalk — Disposable two-person chat

Temporary, real-time chat rooms with an eight-character invite code. No accounts. Rooms and messages expire one hour after room creation.

## Stack
- Node.js + Express
- Socket.IO
- MongoDB Atlas
- Plain HTML/CSS/JavaScript frontend

## Local setup
1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Set `MONGODB_URI` to your MongoDB Atlas connection string, including database user credentials.
4. Run `npm start`.
5. Open `http://localhost:3000`.

## Render
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Environment variable: `MONGODB_URI`

## Expiration and privacy
MongoDB TTL indexes clean up expired room and message documents asynchronously. The application also checks expiry on every room access and message send. A room code acts as its invitation secret; anyone who has the code can attempt to join until two participants are connected. This is not end-to-end encrypted, and messages are stored in MongoDB until expiry.
