const people=[
  {id:"chatgpt",name:"ChatGPT",mark:"C",role:"Not connected",color:"#d6f6e9",ink:"#17654a"},
  {id:"gemini",name:"Gemini",mark:"✦",role:"Gemini API",color:"#dce8ff",ink:"#315db2"},
  {id:"deepseek",name:"DeepSeek",mark:"D",role:"Not connected",color:"#d8eaff",ink:"#245d9b"},
  {id:"meta",name:"Meta AI",mark:"∞",role:"Not connected",color:"#d9e9ff",ink:"#245b9e"},
  {id:"grok",name:"Grok",mark:"X",role:"Not connected",color:"#e5e7eb",ink:"#242832"}
];
const memberBox=document.querySelector("#members"),feed=document.querySelector("#feed"),form=document.querySelector("#form"),input=document.querySelector("#message"),send=document.querySelector("#send");
let conversation=[], providerStatus={};
function renderMembers(){
  memberBox.innerHTML="";
  people.forEach(p=>{
    const connected=Boolean(providerStatus[p.id]);
    const el=document.createElement("div");el.className="member";
    const av=document.createElement("div");av.className="member-avatar";av.textContent=p.mark;av.style.background=p.color;av.style.color=p.ink;
    const info=document.createElement("div");info.className="member-info";
    const name=document.createElement("strong");name.textContent=p.name;
    const role=document.createElement("small");role.textContent=connected?"Live connection":p.id==="gemini"?"Setup needed":"Not connected";
    info.append(name,role);
    const state=document.createElement("span");state.className="member-state"+(connected?" live":"");state.title=connected?"Connected":"Not connected";
    el.append(av,info,state);memberBox.append(el);
  });
}
async function loadStatus(){
  try{
    const r=await fetch("./api/status",{cache:"no-store"});
    if(!r.ok)throw new Error("Backend is not deployed");
    const data=await r.json();
    providerStatus={};
    (data.participants||[]).forEach(p=>providerStatus[p.id]=p.connected);
    const chip=document.querySelector(".demo-chip");
    const gemini=Boolean(providerStatus.gemini);
    chip.innerHTML=gemini?"<i></i> GEMINI LIVE":"<i></i> API SETUP";
    chip.classList.toggle("live",gemini);
    renderMembers();
  }catch{
    document.querySelector(".demo-chip").innerHTML="<i></i> BACKEND SETUP";
    renderMembers();
  }
}
function addMessage(name,text,{user=false,live=false,person=null,system=false}={}){
  document.querySelector("#welcome")?.remove();
  const card=document.createElement("article");card.className="message"+(user?" user":"")+(system?" system":"");
  const head=document.createElement("div");head.className="message-head";
  const av=document.createElement("span");av.className="message-avatar";
  av.textContent=user?"Y":system?"!":person?.mark||"?";
  av.style.background=user?"#e7c3a4":system?"#4a3440":person?.color||"#29334a";
  av.style.color=user?"#38251d":system?"#ffd0d0":person?.ink||"#fff";
  const nm=document.createElement("span");nm.className="message-name";nm.textContent=name;head.append(av,nm);
  if(live){const tag=document.createElement("span");tag.className="message-tag live";tag.textContent="LIVE API";head.append(tag);}
  const body=document.createElement("div");body.className="message-body";body.textContent=text;
  card.append(head,body);feed.append(card);feed.scrollTop=feed.scrollHeight;
}
function showTyping(){
  const el=document.createElement("div");el.className="typing";el.id="typing";
  el.innerHTML="<i></i><i></i><i></i><span>Gemini is thinking…</span>";
  feed.append(el);feed.scrollTop=feed.scrollHeight;return el;
}
function getAccessCode(){
  let code=sessionStorage.getItem("council_access_code");
  if(!code){code=window.prompt("Enter your private AI Council access code (the code you set in Cloudflare):");if(code)sessionStorage.setItem("council_access_code",code);}
  return code||"";
}
async function sendMessage(text){
  const message=text.trim();if(!message||send.disabled)return;
  addMessage("You",message,{user:true});
  input.value="";input.style.height="auto";
  send.disabled=true;
  const typing=showTyping();
  try{
    const code=getAccessCode();
    if(!code){typing.remove();addMessage("System","Your private access code is needed before sending messages.",{system:true});return;}
    const response=await fetch("./api/chat",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-chatroom-code":code},
      body:JSON.stringify({message,history:conversation.slice(-10)})
    });
    const data=await response.json().catch(()=>({}));
    typing.remove();
    if(response.status===401){sessionStorage.removeItem("council_access_code");addMessage("System","That access code was not accepted. Send again and enter the correct code.",{system:true});return;}
    if(!response.ok)throw new Error(data.error||"The AI service could not respond.");
    const reply=(data.replies||[]).find(item=>item.id==="gemini");
    if(!reply)throw new Error("No live Gemini response was returned.");
    const gemini=people.find(p=>p.id==="gemini");
    addMessage("Gemini",reply.content,{live:true,person:gemini});
    conversation.push({role:"user",content:message},{role:"model",content:reply.content});
    conversation=conversation.slice(-10);
  }catch(error){
    typing.remove();
    addMessage("Connection notice",error.message,{system:true});
  }finally{
    send.disabled=false;input.focus();
  }
}
form.addEventListener("submit",e=>{e.preventDefault();sendMessage(input.value)});
input.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();form.requestSubmit()}});
input.addEventListener("input",()=>{input.style.height="auto";input.style.height=Math.min(input.scrollHeight,160)+"px"});
document.querySelectorAll(".suggestion").forEach(button=>button.addEventListener("click",()=>sendMessage(button.dataset.prompt)));
function clearChat(){
  conversation=[];feed.innerHTML='<div class="welcome" id="welcome"><div class="welcome-symbol">✳</div><div class="eyebrow">FIVE MINDS. ONE ROOM.</div><h2>Good conversations<br><span>start here.</span></h2><p>Bring a question, an idea, or a challenge. Your council is ready to explore it from different perspectives.</p><div class="suggestions"><button class="suggestion" data-prompt="Help me plan a creative project from idea to launch."><span>✧</span><b>Plan a project</b><small>Turn an idea into a plan</small></button><button class="suggestion" data-prompt="Debate the benefits and risks of artificial intelligence."><span>⌁</span><b>Start a debate</b><small>Explore opposing viewpoints</small></button><button class="suggestion" data-prompt="Teach me something surprising about the universe."><span>◉</span><b>Learn something</b><small>Explore a new question</small></button></div></div>';
  document.querySelectorAll(".suggestion").forEach(button=>button.addEventListener("click",()=>sendMessage(button.dataset.prompt)));
}
document.querySelector("#clear").addEventListener("click",clearChat);
document.querySelector("#new-chat").addEventListener("click",clearChat);
loadStatus();
