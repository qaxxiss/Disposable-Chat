(() => {
  const $ = id => document.getElementById(id);
  const home = $("home"), namePanel = $("namePanel"), chatPanel = $("chatPanel");
  let socket, activeCode = "", myName = "", expiresAt = 0, timer;
  function showToast(text) { const el=$("toast"); el.textContent=text; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),2600); }
  function view(which) { home.classList.toggle("hidden",which!=="home"); namePanel.classList.toggle("hidden",which!=="name"); chatPanel.classList.toggle("hidden",which!=="chat"); }
  function enterName(code) { activeCode=code; view("name"); $("nickname").focus(); }
  async function api(url, options={}) { const r=await fetch(url,{headers:{"Content-Type":"application/json"},...options}); const data=await r.json(); if(!r.ok) throw new Error(data.error||"Request failed"); return data; }
  $("createBtn").addEventListener("click",async()=>{try{const r=await api("/api/rooms",{method:"POST",body:"{}"}); enterName(r.code);}catch(e){showToast(e.message);}});
  $("joinForm").addEventListener("submit",async e=>{e.preventDefault();const code=$("roomCode").value.trim().toUpperCase();try{await api("/api/rooms/"+encodeURIComponent(code));enterName(code);}catch(err){showToast(err.message);}});
  $("roomCode").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g,""));
  $("backHome").addEventListener("click",()=>view("home"));
  $("nameForm").addEventListener("submit",e=>{e.preventDefault();myName=$("nickname").value.trim().slice(0,24)||"Guest";joinRoom();});
  function joinRoom(){
    socket=io();
    socket.on("connect",()=>socket.emit("room:join",{code:activeCode,name:myName},result=>{
      if(!result.ok){showToast(result.error);socket.disconnect();view("home");return;}
      expiresAt=new Date(result.expiresAt).getTime();
      $("roomLabel").textContent=activeCode;$("shareCode").textContent=activeCode;$("roomStatus").textContent="You are in. Share the code with one person.";
      view("chat");$("messages").innerHTML="";result.history.forEach(addMessage);startTimer();
    }));
    socket.on("connect_error",()=>showToast("Connection issue. Please retry."));
    socket.on("message:new",addMessage);
    socket.on("system:notice",data=>{const n=document.createElement("div");n.className="notice";n.textContent=data.text;$("messages").appendChild(n);scrollMessages();});
  }
  function addMessage(m){
    const empty=$("messages").querySelector(".empty-chat");if(empty)empty.remove();
    const wrap=document.createElement("div");wrap.className="bubble"+(m.name===myName?" mine":"");
    const name=document.createElement("div");name.className="bubble-name";name.textContent=m.name;
    const text=document.createElement("div");text.className="bubble-text";text.textContent=m.text;
    const time=document.createElement("div");time.className="bubble-time";time.textContent=new Date(m.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    wrap.append(name,text,time);$("messages").appendChild(wrap);scrollMessages();
  }
  function scrollMessages(){$("messages").scrollTop=$("messages").scrollHeight;}
  $("messageForm").addEventListener("submit",e=>{e.preventDefault();const input=$("messageInput");const text=input.value.trim();if(!text||!socket?.connected)return;socket.emit("message:send",{text},r=>{if(!r.ok)showToast(r.error);else input.value="";});});
  $("copyBtn").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(activeCode);showToast("Room code copied.");}catch{showToast("Copy unavailable. Select the code manually.");}});
  function startTimer(){clearInterval(timer);const tick=()=>{const left=Math.max(0,expiresAt-Date.now());const mins=Math.floor(left/60000),secs=Math.floor(left%60000/1000);$("countdown").textContent=String(mins).padStart(2,"0")+":"+String(secs).padStart(2,"0");if(left<=0){clearInterval(timer);socket?.disconnect();showToast("This room has expired.");view("home");}};tick();timer=setInterval(tick,1000);}
  $("leaveBtn").addEventListener("click",()=>{clearInterval(timer);socket?.disconnect();socket=null;view("home");showToast("You left the room.");});
})();