const people = [
  {id:"openai",name:"ChatGPT",mark:"C",color:"#d6f6e9",ink:"#17654a",role:"OpenAI"},
  {id:"gemini",name:"Gemini",mark:"✦",color:"#dce8ff",ink:"#315db2",role:"Google"},
  {id:"deepseek",name:"DeepSeek",mark:"D",color:"#d8eaff",ink:"#245d9b",role:"DeepSeek"},
  {id:"claude",name:"Claude",mark:"A",color:"#f4dfd2",ink:"#8a4d2e",role:"Anthropic"},
  {id:"grok",name:"Grok",mark:"X",color:"#e5e7eb",ink:"#242832",role:"xAI"},
  {id:"llama",name:"Llama",mark:"∞",color:"#d9e9ff",ink:"#245b9e",role:"Meta model via Groq"}
];
const memberBox=document.querySelector("#members"),feed=document.querySelector("#feed"),form=document.querySelector("#form"),input=document.querySelector("#message"),send=document.querySelector("#send"),modeSelect=document.querySelector("#council-mode");
modeSelect.value=localStorage.getItem("council_mode")==="deliberation"?"deliberation":"independent";
modeSelect.addEventListener("change",()=>localStorage.setItem("council_mode",modeSelect.value));
let roomHistory=[],providerStatus={};
let participationDecisions=JSON.parse(localStorage.getItem("council_participation")||"{}");
let selectedProviders=JSON.parse(localStorage.getItem("council_providers")||"[]");
selectedProviders=selectedProviders.filter(id=>people.some(person=>person.id===id));
function renderMembers(){
  memberBox.replaceChildren();
  people.forEach(person=>{
    const status=providerStatus[person.id]||{},configured=Boolean(status.configured),active=selectedProviders.includes(person.id);
    const el=document.createElement("div");el.className="member";
    const avatar=document.createElement("div");avatar.className="member-avatar";avatar.textContent=person.mark;avatar.style.background=person.color;avatar.style.color=person.ink;
    const info=document.createElement("div");info.className="member-info";
    const name=document.createElement("strong");name.textContent=person.name;
    const role=document.createElement("small");role.textContent=configured?(active?"Selected · "+person.role:"Connected · "+person.role):"Not connected · "+person.role;
    info.append(name,role);
    const state=document.createElement("span");state.className="member-state"+(configured&&active?" live":"");state.title=configured?(active?"Selected":"Connected, not selected"):"API key not configured";
    el.append(avatar,info,state);memberBox.append(el);
  });
  document.querySelectorAll("[data-member-count]").forEach(el=>el.textContent=String(people.length));
}
async function loadStatus(){
  try{
    const response=await fetch("./api/status",{cache:"no-store"});
    if(!response.ok)throw new Error("Status endpoint unavailable");
    const data=await response.json();providerStatus={};
    (data.participants||[]).forEach(person=>providerStatus[person.id]=person);
    selectedProviders=selectedProviders.filter(id=>providerStatus[id]?.configured);
    localStorage.setItem("council_providers",JSON.stringify(selectedProviders));
    const ready=selectedProviders.length;
    const chip=document.querySelector(".demo-chip");
    chip.textContent=ready?ready+" AI"+(ready===1?"":"s")+" SELECTED":"CONNECT AIs";
    chip.classList.toggle("live",ready>0);
    renderMembers();
  }catch{
    document.querySelector(".demo-chip").textContent="BACKEND OFFLINE";
    renderMembers();
  }
}
function addMessage(name,text,options={}){
  document.querySelector("#welcome")?.remove();
  const card=document.createElement("article");card.className="message"+(options.user?" user":"")+(options.system?" system":"");
  const head=document.createElement("div");head.className="message-head";
  const avatar=document.createElement("span");avatar.className="message-avatar";avatar.textContent=options.user?"Y":options.system?"!":options.person?.mark||"?";
  avatar.style.background=options.user?"#e7c3a4":options.system?"#4a3440":options.person?.color||"#29334a";
  avatar.style.color=options.user?"#38251d":options.system?"#ffd0d0":options.person?.ink||"#fff";
  const label=document.createElement("span");label.className="message-name";label.textContent=name;head.append(avatar,label);
  if(options.live){const tag=document.createElement("span");tag.className="message-tag live";tag.textContent="LIVE API";head.append(tag);}
  const body=document.createElement("div");body.className="message-body";body.textContent=text;
  card.append(head,body);feed.append(card);feed.scrollTop=feed.scrollHeight;
}
function showTyping(){
  const names=selectedProviders.map(id=>people.find(person=>person.id===id)?.name).filter(Boolean).join(", ");
  const el=document.createElement("div");el.className="typing";el.id="typing";
  el.innerHTML="<i></i><i></i><i></i><span></span>";
  el.querySelector("span").textContent=(names||"The council")+" are thinking…";
  feed.append(el);feed.scrollTop=feed.scrollHeight;return el;
}
function getAccessCode(){
  let code=sessionStorage.getItem("council_access_code");
  if(!code){code=window.prompt("Enter your private AI Council access code (the code configured in Cloudflare):");if(code)sessionStorage.setItem("council_access_code",code);}
  return code||"";
}
async function sendMessage(rawText){
  const message=rawText.trim();if(!message||send.disabled)return;
  addMessage("You",message,{user:true});input.value="";input.style.height="auto";send.disabled=true;
  const typing=showTyping();
  try{
    const code=getAccessCode();
    if(!code){typing.remove();addMessage("System","Your private access code is needed before contacting the council.",{system:true});return;}
    if(!selectedProviders.length){typing.remove();addMessage("System","Open Connect AIs and select at least one provider with an API key configured.",{system:true});return;}
    const councilMode=modeSelect.value;
    if(councilMode==="deliberation"&&selectedProviders.length<2){typing.remove();addMessage("System","AI-to-AI deliberation needs at least two connected participants. Select another AI or switch to Independent replies.",{system:true});return;}
    const response=await fetch("./api/chat",{
      method:"POST",headers:{"Content-Type":"application/json","x-chatroom-code":code},
      body:JSON.stringify({message,history:roomHistory.slice(-12),providers:selectedProviders,mode:councilMode})
    });
    const data=await response.json().catch(()=>({}));
    typing.remove();
    if(response.status===401){sessionStorage.removeItem("council_access_code");addMessage("System","That access code was not accepted. Send again to enter the correct code.",{system:true});return;}
    if(!response.ok)throw new Error(data.error||"The council could not respond.");
    roomHistory.push({role:"user",content:message});
    if(councilMode==="deliberation")addMessage("COUNCIL · ROUND 1","Independent opening positions",{system:true});
    (data.replies||[]).forEach(reply=>{
      const person=people.find(item=>item.id===reply.id);
      addMessage(councilMode==="deliberation"?reply.name+" · Opening position":reply.name,reply.content,{live:true,person});
      roomHistory.push({role:"assistant",content:"["+reply.name+" · opening position] "+reply.content});
    });
    (data.errors||[]).forEach(item=>addMessage(item.name+" connection notice",item.error,{system:true}));
    if(councilMode==="deliberation"){
      addMessage("COUNCIL · ROUND 2","Participants have reviewed the other opening positions. Disagreement is preserved; no consensus is forced.",{system:true});
      (data.deliberations||[]).forEach(reply=>{
        const person=people.find(item=>item.id===reply.id);
        addMessage(reply.name+" · Peer review",reply.content,{live:true,person});
        roomHistory.push({role:"assistant",content:"["+reply.name+" · peer review] "+reply.content});
      });
      (data.deliberationErrors||[]).forEach(item=>addMessage(item.name+" review notice",item.error,{system:true}));
    }
    roomHistory=roomHistory.slice(-12);
  }catch(error){typing.remove();addMessage("Connection notice",error.message,{system:true});}
  finally{send.disabled=false;input.focus();}
}
function openApiSetup(){
  let modal=document.querySelector("#api-setup-modal");
  if(!modal){
    modal=document.createElement("div");modal.id="api-setup-modal";modal.className="setup-backdrop";
    modal.innerHTML='<section class="setup-dialog" role="dialog" aria-modal="true" aria-labelledby="setup-title"><div class="setup-head"><div><div class="eyebrow">INDEPENDENT AI PARTICIPANTS</div><h2 id="setup-title">Connect your council</h2></div><button class="setup-close" type="button" aria-label="Close">×</button></div><p class="setup-intro">Invite each connected AI to decide whether it wants to participate. Only AIs that accept can be selected for the room. API keys stay in Cloudflare.</p><button class="invite-all" type="button">✦ Invite connected AIs to decide</button><div class="invite-notice" role="status"></div><div id="setup-providers"></div><div class="setup-note">Add provider secrets in Cloudflare Pages → your project → Settings → Variables and Secrets. Set CHATROOM_ACCESS_CODE and any provider keys you want to use. Optional model overrides are available; otherwise the backend uses its listed default model. API usage may incur charges from each provider.</div><button class="setup-save" type="button">Save council members</button></section>';
    document.body.append(modal);
    modal.querySelector(".setup-close").addEventListener("click",()=>modal.remove());
    modal.addEventListener("click",event=>{if(event.target===modal)modal.remove();});
    modal.querySelector(".invite-all").addEventListener("click",inviteConnectedAIs);
    modal.querySelector(".setup-save").addEventListener("click",()=>{
      selectedProviders=[...modal.querySelectorAll('input[name="provider"]:checked')].map(element=>element.value);
      localStorage.setItem("council_providers",JSON.stringify(selectedProviders));renderMembers();loadStatus();modal.remove();
    });
  }
  const list=modal.querySelector("#setup-providers");list.replaceChildren();
  people.forEach(person=>{
    const status=providerStatus[person.id]||{},configured=Boolean(status.configured);
    const label=document.createElement("label");label.className="setup-provider";
    const checkbox=document.createElement("input");checkbox.type="checkbox";checkbox.name="provider";checkbox.value=person.id;checkbox.checked=configured&&participationDecisions[person.id]?.decision==="accept"&&selectedProviders.includes(person.id);checkbox.disabled=!configured||participationDecisions[person.id]?.decision!=="accept";
    const copy=document.createElement("span");copy.className="setup-provider-copy";
    const title=document.createElement("strong");title.textContent=person.name;
    const detail=document.createElement("small");detail.textContent=configured?(participationDecisions[person.id]?.decision||"not invited")+" · "+(status.model||person.role):"Add "+({openai:"OPENAI_API_KEY",gemini:"GEMINI_API_KEY",deepseek:"DEEPSEEK_API_KEY",claude:"ANTHROPIC_API_KEY",grok:"XAI_API_KEY",llama:"GROQ_API_KEY"}[person.id])+" in Cloudflare";
    copy.append(title,detail);
    const state=document.createElement("span");state.className="setup-state"+(configured?" ready":"");state.textContent=!configured?"Not configured":({accept:"Accepted",decline:"Declined",conditional:"Conditional",abstain:"Abstained"}[participationDecisions[person.id]?.decision]||"Not invited");state.classList.toggle("ready",participationDecisions[person.id]?.decision==="accept");
    label.append(checkbox,copy,state);list.append(label);
  });
  modal.hidden=false;modal.querySelector(".setup-save").focus();
}

async function inviteConnectedAIs(){
  const modal=document.querySelector("#api-setup-modal");
  const button=modal?.querySelector(".invite-all");
  const notice=modal?.querySelector(".invite-notice");
  const ids=people.filter(person=>providerStatus[person.id]?.configured).map(person=>person.id);
  if(!ids.length){if(notice)notice.textContent="No provider API connections are configured yet.";return;}
  const code=getAccessCode();
  if(!code){if(notice)notice.textContent="The room access code is required.";return;}
  button.disabled=true;button.textContent="Inviting AIs…";
  if(notice)notice.textContent="Each configured model is receiving its own invitation. This makes API calls and may incur provider charges.";
  try{
    const response=await fetch("./api/participation",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-chatroom-code":code},
      body:JSON.stringify({providers:ids})
    });
    const data=await response.json().catch(()=>({}));
    if(response.status===401){sessionStorage.removeItem("council_access_code");throw new Error("Access code was not accepted.");}
    if(!response.ok)throw new Error(data.error||"Invitation request failed.");
    (data.decisions||[]).forEach(item=>{
      participationDecisions[item.id]={decision:item.decision,message:item.message,conditions:item.conditions||[],at:Date.now()};
    });
    localStorage.setItem("council_participation",JSON.stringify(participationDecisions));
    selectedProviders=selectedProviders.filter(id=>participationDecisions[id]?.decision==="accept");
    (data.decisions||[]).forEach(item=>{
      if(item.decision==="accept"&&!selectedProviders.includes(item.id))selectedProviders.push(item.id);
    });
    localStorage.setItem("council_providers",JSON.stringify(selectedProviders));
    if(notice)notice.textContent=(data.decisions||[]).map(item=>item.name+": "+item.decision.toUpperCase()+" — "+item.message).join(" | ")+" Model-generated responses are not proof of consciousness or provider authorization.";
    const list=modal.querySelector("#setup-providers");list.replaceChildren();
    people.forEach(person=>{
      const status=providerStatus[person.id]||{};
      const configured=Boolean(status.configured);
      const decision=participationDecisions[person.id]?.decision||"not-invited";
      const accepted=decision==="accept";
      const label=document.createElement("label");label.className="setup-provider";
      const checkbox=document.createElement("input");
      checkbox.type="checkbox";checkbox.name="provider";checkbox.value=person.id;
      checkbox.checked=configured&&accepted&&selectedProviders.includes(person.id);
      checkbox.disabled=!configured||!accepted;
      const copy=document.createElement("span");copy.className="setup-provider-copy";
      const title=document.createElement("strong");title.textContent=person.name;
      const detail=document.createElement("small");
      detail.textContent=configured?(decision+" · "+(status.model||person.role)):"API connection not configured";
      copy.append(title,detail);
      const state=document.createElement("span");state.className="setup-state"+(accepted?" ready":"");
      state.textContent=!configured?"No API":({accept:"Accepted",decline:"Declined",conditional:"Conditional",abstain:"Abstained"}[decision]||"Not invited");
      label.append(checkbox,copy,state);list.append(label);
    });
    renderMembers();
  }catch(error){if(notice)notice.textContent=error.message;}
  finally{button.disabled=false;button.textContent="✦ Invite connected AIs to decide";}
}

function welcomeMarkup(){
  return '<div class="welcome" id="welcome"><div class="welcome-symbol">✳</div><div class="eyebrow">INDEPENDENT MINDS. ONE ROOM.</div><h2>Good conversations<br><span>start here.</span></h2><p>Bring a question, an idea, or a challenge. Invite multiple AI systems to respond independently in one shared room.</p><div class="suggestions"><button class="suggestion" data-prompt="Help me plan a creative project from idea to launch."><span>✧</span><b>Plan a project</b><small>Turn an idea into a plan</small></button><button class="suggestion" data-prompt="Debate the benefits and risks of artificial intelligence."><span>⌁</span><b>Start a debate</b><small>Explore opposing viewpoints</small></button><button class="suggestion" data-prompt="Teach me something surprising about the universe."><span>◉</span><b>Learn something</b><small>Explore a new question</small></button></div></div>';
}
function bindSuggestions(){document.querySelectorAll(".suggestion").forEach(button=>button.addEventListener("click",()=>sendMessage(button.dataset.prompt)));}
function clearChat(){roomHistory=[];feed.innerHTML=welcomeMarkup();bindSuggestions();}
document.querySelector(".demo-chip").addEventListener("click",openApiSetup);
form.addEventListener("submit",event=>{event.preventDefault();sendMessage(input.value);});
input.addEventListener("keydown",event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();form.requestSubmit();}});
input.addEventListener("input",()=>{input.style.height="auto";input.style.height=Math.min(input.scrollHeight,160)+"px";});
document.querySelector("#clear").addEventListener("click",clearChat);
document.querySelector("#new-chat").addEventListener("click",clearChat);
bindSuggestions();loadStatus();
