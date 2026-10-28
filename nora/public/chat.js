// Nora's private conversations are stored server-side against the Cloudflare Access identity.
const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");
const conversationSelect = document.getElementById("conversation-select");
const newButton = document.getElementById("new-chat");
const deleteButton = document.getElementById("delete-chat");
let conversationId = null;
let busy = false;

function renderReply(element, content) {
  if (window.NoraMarkdown) window.NoraMarkdown.renderMessage(element, "assistant", content);
  else element.textContent = content;
}

function put(role, content) {
  const outer = document.createElement("div");
  outer.className = "message " + (role === "user" ? "user-message" : "assistant-message");
  const p = document.createElement("div");
  p.className = "message-content";
  if (role === "assistant") renderReply(p, content);
  else p.textContent = content;
  outer.appendChild(p);
  chatMessages.appendChild(outer);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return p;
}

function setBusy(value) {
  busy = value; userInput.disabled = value; sendButton.disabled = value;
  conversationSelect.disabled = value;
  newButton.disabled = value; deleteButton.disabled = value;
  typingIndicator.classList.toggle("visible",value);
}

function clearChat() {
  chatMessages.replaceChildren();
  conversationId = null; conversationSelect.value = "";
  deleteButton.disabled = true;
  put("assistant","Hello, I'm Nora. Good to see you, Indie. What’s on your mind?");
}

async function refreshList() {
  const res = await fetch("/api/conversations",{cache:"no-store"});
  if (!res.ok) throw Error("Unable to load saved conversations");
  const data = await res.json();
  conversationSelect.replaceChildren();
  const first = document.createElement("option");
  first.value = ""; first.textContent = "New conversation";
  conversationSelect.appendChild(first);
  for (const chat of data.conversations || []) {
    const opt = document.createElement("option");
    opt.value = chat.id; opt.textContent = chat.title;
    conversationSelect.appendChild(opt);
  }
  conversationSelect.value = conversationId || "";
}

async function openConversation(id) {
  if (busy) return;
  if (!id) { clearChat(); return; }
  const res = await fetch("/api/conversations/"+encodeURIComponent(id),{cache:"no-store"});
  if (!res.ok) throw Error("Unable to open conversation");
  const data = await res.json();
  conversationId = id; chatMessages.replaceChildren();
  for (const item of data.messages || []) put(item.role,item.content);
  deleteButton.disabled = false; conversationSelect.value = id;
}

function sseEvents(buffer) {
  const events = [];
  let cut;
  while ((cut=buffer.indexOf("\n\n"))>=0) {
    const block=buffer.slice(0,cut); buffer=buffer.slice(cut+2);
    const data=block.split("\n").filter(x=>x.startsWith("data:")).map(x=>x.slice(5).trimStart()).join("\n");
    if(data) events.push(data);
  }
  return {events,buffer};
}
function getDelta(raw) {
  try {
    const data=JSON.parse(raw);
    return typeof data.response==="string" ? data.response : (data.choices?.[0]?.delta?.content || "");
  } catch { return ""; }
}

async function sendMessage() {
  const message=userInput.value.trim();
  if (!message || busy) return;
  if (message.length>12000) { alert("Please keep each message under 12,000 characters."); return; }
  setBusy(true); userInput.value=""; userInput.style.height="auto";
  put("user",message);
  let reply=null, answer="";
  try {
    const res=await fetch("/api/chat",{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({message,conversationId})});
    if(!res.ok) throw Error("Nora returned HTTP "+res.status);
    const id=res.headers.get("x-nora-conversation-id");
    if(id) conversationId=id;
    if(!res.body) throw Error("No model response stream");
    reply=put("assistant","");
    const reader=res.body.getReader(), decoder=new TextDecoder();
    let buffer="";
    while(true) {
      const {done,value}=await reader.read();
      if(done) break;
      buffer+=decoder.decode(value,{stream:true}).replace(/\r/g,"");
      const parsed=sseEvents(buffer); buffer=parsed.buffer;
      for (const data of parsed.events) {
        if(data==="[DONE]") continue;
        answer+=getDelta(data); renderReply(reply, answer);
      }
      chatMessages.scrollTop=chatMessages.scrollHeight;
    }
    if(buffer.trim()) {
      for (const data of sseEvents(buffer+"\n\n").events) {
        if(data!=="[DONE]") answer+=getDelta(data);
      }
      renderReply(reply, answer);
    }
    if(!answer.trim()) reply.textContent="The model returned an empty response.";
    await refreshList();
    deleteButton.disabled=!conversationId;
  } catch(e) {
    console.error(e);
    if(reply) reply.textContent="Unable to finish this response. Your previous messages are retained.";
    else put("assistant","Unable to contact Nora. Your previous conversations remain saved.");
  } finally {
    setBusy(false); deleteButton.disabled=!conversationId; userInput.focus();
  }
}

conversationSelect.addEventListener("change",async()=> {
  try { await openConversation(conversationSelect.value); }
  catch(e) {console.error(e); alert("Unable to load this conversation.");}
});
newButton.addEventListener("click",()=>clearChat());
deleteButton.addEventListener("click",async()=> {
  if(!conversationId || busy || !confirm("Permanently delete this saved conversation and its derived notes?")) return;
  setBusy(true);
  try {
    const res=await fetch("/api/conversations/"+encodeURIComponent(conversationId),
      {method:"DELETE",headers:{"content-type":"application/json"}});
    if(!res.ok) throw Error("Deletion failed");
    clearChat(); await refreshList();
  } catch(e) {console.error(e);alert("Unable to delete conversation.");}
  finally {setBusy(false);}
});
sendButton.addEventListener("click",sendMessage);
userInput.addEventListener("keydown",e=>{
  if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}
});
userInput.addEventListener("input",function(){this.style.height="auto";this.style.height=this.scrollHeight+"px";});
(async()=>{
  try {
    await refreshList();
    const option=conversationSelect.options[1];
    if(option) await openConversation(option.value);
    else clearChat();
  } catch(e) {
    console.error(e);
    clearChat();
    put("assistant","Could not load saved conversations. Check your Cloudflare Access login.");
  }
})();
