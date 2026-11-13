const people=[
  {id:"chatgpt",name:"ChatGPT",mark:"C",color:"#d6f6e9",ink:"#17654a"},
  {id:"gemini",name:"Gemini",mark:"✦",color:"#dce8ff",ink:"#315db2"},
  {id:"deepseek",name:"DeepSeek",mark:"D",color:"#d8eaff",ink:"#245d9b"},
  {id:"meta",name:"Meta AI",mark:"∞",color:"#d9e9ff",ink:"#245b9e"},
  {id:"grok",name:"Grok",mark:"X",color:"#e5e7eb",ink:"#242832"}
];
const memberBox=document.querySelector("#members"),feed=document.querySelector("#feed"),form=document.querySelector("#form"),input=document.querySelector("#message"),send=document.querySelector("#send");
let conversation=[],providerStatus={};
let selectedProviders=JSON.parse(localStorage.getItem("council_providers")||'["gemini"]');
selectedProviders=selectedProviders.filter(id=>id==="gemini"||id==="deepseek");
if(!selectedProviders.length)selectedProviders=["gemini"];
function renderMembers(){
  memberBox.innerHTML="";
  people.forEach(p=>{
    const configured=Boolean(providerStatus[p.id]?.configured);
    const active=selectedProviders.includes(p.id);
    const el=document.createElement("div");el.className="member";
    const av=document.createElement("div");av.className="member-avatar";av.textContent=p.mark;av.style.background=p.color;av.style.color=p.ink;
    const info=document.createElement("div");info.className="member-info";
    const name=document.createElement("strong");name.textContent=p.name;
    const role=document.createElement("small");role.textContent=configured?(active?"Ready for replies":"Connected · off"):"Not connected";
    info.append(name,role);
    const state=document.createElement("span");state.className="member-state"+(configured&&active?" live":"");state.title=configured?(active?"Selected":"Configured but off"):"Not connected";
    el.append(av,info,state);memberBox.append(el);
  });
}
async function loadStatus(){
  try{
    const r=await fetch("./api/status",{cache:"no-store"});
    if(!r.ok)throw new Error("Backend is not deployed");
    const data=await r.json();
    providerStatus={};
    (data.participants||[]).forEach(p=>providerStatus[p.id]=p);
    if(!providerStatus.gemini?.configured)selectedProviders=selectedProviders.filter(id=>id!=="gemini");
    if(!providerStatus.deepseek?.configured)selectedProviders=selectedProviders.filter(id=>id!=="deepseek");
    if(!selectedProviders.length&&providerStatus.gemini?.configured)selectedProviders=["gemini"];
    localStorage.setItem("council_providers",JSON.stringify(selectedProviders));
    const chip=document.querySelector(".demo-chip");
    const activeNames=selectedProviders.map(id=>people.find(p=>p.id===id)?.name).filter(Boolean);
    chip.textContent=activeNames.length?activeNames.join(" + ")+" LIVE":"API SETUP";
    chip.classList.toggle("live",activeNames.length>0);
    renderMembers();
  }catch{
    document.querySelector(".demo-chip").textContent="BACKEND SETUP";
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
  const names=selectedProviders.map(id=>people.find(p=>p.id===id)?.name).filter(Boolean).join(" and ");
  const el=document.createElement("div");el.className="typing";el.id="typing";
  el.innerHTML="<i></i><i></i><i></i><span></span>";
  el.querySelector("span").textContent=(names||"Your council")+" thinking…";
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
    const providers=selectedProviders.filter(id=>providerStatus[id]?.configured);
    if(!providers.length)throw new Error("Open API Setup and enable a configured provider first.");
    const response=await fetch("./api/chat",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-chatroom-code":code},
      body:JSON.stringify({message,history:conversation.slice(-10),providers})
    });
    const data=await response.json().catch(()=>({}));
    typing.remove();
    if(response.status===401){sessionStorage.removeItem("council_access_code");addMessage("System","That access code was not accepted. Send again and enter the correct code.",{system:true});return;}
    if(!response.ok)throw new Error(data.error||"The AI service could not respond.");
    (data.replies||[]).forEach(reply=>{
      const person=people.find(p=>p.id===reply.id);
      addMessage(reply.name,reply.content,{live:true,person});
      conversation.push({role:"user",content:message},{role:"model",content:reply.content});
    });
    (data.errors||[]).forEach(item=>addMessage(item.name+" connection notice",item.error,{system:true}));
    conversation=conversation.slice(-10);
  }catch(error){
    typing.remove();
    addMessage("Connection notice",error.message,{system:true});
  }finally{
    send.disabled=false;input.focus();
  }
}
function openApiSetup(){
  let modal=document.querySelector("#api-setup-modal");
  if(!modal){
    modal=document.createElement("div");modal.id="api-setup-modal";modal.className="setup-backdrop";
    modal.innerHTML='<section class="setup-dialog" role="dialog" aria-modal="true" aria-labelledby="setup-title"><div class="setup-head"><div><div class="eyebrow">COUNCIL CONNECTIONS</div><h2 id="setup-title">API Setup</h2></div><button class="setup-close" type="button" aria-label="Close">×</button></div><p class="setup-intro">Your API keys stay safely in Cloudflare. This page never asks you to paste a secret into the browser.</p><div id="setup-providers"></div><div class="setup-note" id="setup-note">Gemini is selected by default. DeepSeek replies are off until you turn them on. API usage may incur charges according to your provider balance and pricing.</div><button class="setup-save" type="button">Save settings</button></section>';
    document.body.append(modal);
    modal.querySelector(".setup-close").addEventListener("click",()=>modal.remove());
    modal.addEventListener("click",e=>{if(e.target===modal)modal.remove()});
    modal.querySelector(".setup-save").addEventListener("click",()=>{
      selectedProviders=[...modal.querySelectorAll('input[name="provider"]:checked')].map(el=>el.value);
      localStorage.setItem("council_providers",JSON.stringify(selectedProviders));
      renderMembers();loadStatus();modal.remove();
    });
  }
  const list=modal.querySelector("#setup-providers");list.innerHTML="";
  ["gemini","deepseek"].forEach(id=>{
    const person=people.find(p=>p.id===id),status=providerStatus[id]||{},configured=Boolean(status.configured);
    const label=document.createElement("label");label.className="setup-provider";
    const inputEl=document.createElement("input");inputEl.type="checkbox";inputEl.name="provider";inputEl.value=id;inputEl.checked=configured&&selectedProviders.includes(id);inputEl.disabled=!configured;
    const copy=document.createElement("span");copy.className="setup-provider-copy";
    const title=document.createElement("strong");title.textContent=person.name;
    const sub=document.createElement("small");sub.textContent=configured?(id==="deepseek"?"Key stored in Cloudflare · usage is optional":"Key stored in Cloudflare"):"Not configured · add "+(id==="gemini"?"GEMINI_API_KEY":"DEEPSEEK_API_KEY")+" in Cloudflare";
    copy.append(title,sub);
    const state=document.createElement("span");state.className="setup-state"+(configured?" ready":"");state.textContent=configured?"Configured":"Missing key";
    label.append(inputEl,copy,state);list.append(label);
  });
  modal.hidden=false;
  modal.querySelector(".setup-save").focus();
}
document.querySelector(".demo-chip").addEventListener("click",openApiSetup);
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
