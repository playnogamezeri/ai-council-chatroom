const people = [
  {id:"openai",name:"ChatGPT",mark:"C",color:"#d6f6e9",ink:"#17654a",url:"https://chatgpt.com/"},
  {id:"gemini",name:"Gemini",mark:"✦",color:"#dce8ff",ink:"#315db2",url:"https://gemini.google.com/app"},
  {id:"claude",name:"Claude",mark:"A",color:"#f4dfd2",ink:"#8a4d2e",url:"https://claude.ai/new"},
  {id:"grok",name:"Grok",mark:"X",color:"#e5e7eb",ink:"#242832",url:"https://grok.com/"},
  {id:"deepseek",name:"DeepSeek",mark:"D",color:"#d8eaff",ink:"#245d9b",url:"https://chat.deepseek.com/"},
  {id:"meta",name:"Meta AI",mark:"∞",color:"#d9e9ff",ink:"#245b9e",url:"https://www.meta.ai/"}
];
const memberBox=document.querySelector("#members"),feed=document.querySelector("#feed"),form=document.querySelector("#form"),input=document.querySelector("#message"),send=document.querySelector("#send");
let selectedProviders=JSON.parse(localStorage.getItem("council_browser_sites")||JSON.stringify(people.map(p=>p.id)));
selectedProviders=selectedProviders.filter(id=>people.some(p=>p.id===id));
let latestPrompt="";
function saveSelection(){localStorage.setItem("council_browser_sites",JSON.stringify(selectedProviders));}
function renderMembers(){
  memberBox.replaceChildren();
  people.forEach(person=>{
    const active=selectedProviders.includes(person.id);
    const el=document.createElement("div");el.className="member browser-member"+(active?" selected":"");
    const avatar=document.createElement("div");avatar.className="member-avatar";avatar.textContent=person.mark;avatar.style.background=person.color;avatar.style.color=person.ink;
    const info=document.createElement("div");info.className="member-info";
    const name=document.createElement("strong");name.textContent=person.name;
    const role=document.createElement("small");role.textContent=active?"Selected for this prompt":"Not selected";
    info.append(name,role);
    const actions=document.createElement("div");actions.className="browser-member-actions";
    const check=document.createElement("input");check.type="checkbox";check.checked=active;check.setAttribute("aria-label","Include "+person.name);
    check.addEventListener("change",()=>{selectedProviders=check.checked?[...selectedProviders,person.id]:selectedProviders.filter(id=>id!==person.id);saveSelection();renderMembers();});
    const open=document.createElement("button");open.type="button";open.className="site-open";open.textContent="OPEN";open.title="Open "+person.name+" in a separate browser tab";
    open.addEventListener("click",()=>{const tab=window.open(person.url,"_blank","noopener");if(!tab){addLocalNotice("Your browser blocked the new tab. Allow pop-ups for this Council page, then try again.");}});
    actions.append(check,open);el.append(avatar,info,actions);memberBox.append(el);
  });
  document.querySelectorAll("[data-member-count]").forEach(el=>el.textContent=String(people.length));
}
function addLocalNotice(text){
  const card=document.createElement("article");card.className="message system";
  const head=document.createElement("div");head.className="message-head";
  const avatar=document.createElement("span");avatar.className="message-avatar";avatar.textContent="✦";
  const label=document.createElement("span");label.className="message-name";label.textContent="Council note";
  head.append(avatar,label);
  const body=document.createElement("div");body.className="message-body";body.textContent=text;
  card.append(head,body);feed.append(card);feed.scrollTop=feed.scrollHeight;
}
function addMessage(name,text,options={}){
  document.querySelector("#welcome")?.remove();
  if(!options.remote&&!options.system&&window.CouncilNetwork){
    window.CouncilNetwork.publish({name,text,role:options.user?"human":"agent",participant:options.person?.id||null});
  }
  const card=document.createElement("article");card.className="message"+(options.user?" user":"")+(options.system?" system":"");
  const head=document.createElement("div");head.className="message-head";
  const avatar=document.createElement("span");avatar.className="message-avatar";avatar.textContent=options.user?"Y":options.person?.mark||"✦";
  avatar.style.background=options.user?"#e7c3a4":options.person?.color||"#4a3440";avatar.style.color=options.user?"#38251d":options.person?.ink||"#fff";
  const label=document.createElement("span");label.className="message-name";label.textContent=name;head.append(avatar,label);
  if(options.live){const tag=document.createElement("span");tag.className="message-tag live";tag.textContent="WEBSITE REPLY";head.append(tag);}
  const body=document.createElement("div");body.className="message-body";body.textContent=text;
  card.append(head,body);feed.append(card);feed.scrollTop=feed.scrollHeight;
}
async function copyText(text){
  if(!text)return false;
  try{await navigator.clipboard.writeText(text);return true;}
  catch{
    const helper=document.createElement("textarea");helper.value=text;helper.style.position="fixed";helper.style.opacity="0";document.body.append(helper);helper.select();
    let ok=false;try{ok=document.execCommand("copy");}catch{}helper.remove();return ok;
  }
}
async function sendMessage(rawText){
  const message=rawText.trim();if(!message||send.disabled)return;
  latestPrompt=message;
  addMessage("You",message,{user:true});input.value="";input.style.height="auto";
  const copied=await copyText(message);
  addLocalNotice(copied?"Prompt copied to clipboard. Open the selected AI websites on the left, paste the prompt into each one, then use ADD AI REPLY to share their answers here.":"Prompt posted. If clipboard access was blocked, copy it from your message and paste it into each AI website.");
  input.focus();
}
function welcomeMarkup(){
 return '<div class="welcome" id="welcome"><div class="welcome-symbol">✳</div><div class="eyebrow">YOUR LOGINS. ONE SHARED ROOM.</div><h2>Bring your AIs<br><span>to the table.</span></h2><p>Send a prompt to the room, open your signed-in AI websites one by one, and bring their responses back here.</p><div class="suggestions"><button class="suggestion" data-prompt="Help me plan a creative project from idea to launch."><span>✧</span><b>Plan a project</b><small>Turn an idea into a plan</small></button><button class="suggestion" data-prompt="Debate the benefits and risks of artificial intelligence."><span>⌁</span><b>Start a debate</b><small>Explore opposing viewpoints</small></button><button class="suggestion" data-prompt="Teach me something surprising about the universe."><span>◉</span><b>Learn something</b><small>Explore a new question</small></button></div></div>';
}
function bindSuggestions(){document.querySelectorAll(".suggestion").forEach(button=>button.addEventListener("click",()=>sendMessage(button.dataset.prompt)));}
function clearChat(){feed.innerHTML=welcomeMarkup();latestPrompt="";bindSuggestions();}
function openReplyDialog(){
  let modal=document.querySelector("#reply-modal");
  if(!modal){
    modal=document.createElement("div");modal.id="reply-modal";modal.className="setup-backdrop";
    modal.innerHTML='<section class="setup-dialog" role="dialog" aria-modal="true" aria-labelledby="reply-title"><div class="setup-head"><div><div class="eyebrow">BRING A WEBSITE RESPONSE INTO THE ROOM</div><h2 id="reply-title">Add AI reply</h2></div><button class="setup-close" type="button" aria-label="Close">×</button></div><p class="setup-intro">Paste the answer you copied from an AI website. It will be shared in the live Council room with the selected AI attribution.</p><label class="reply-label" for="reply-provider">AI WEBSITE</label><select id="reply-provider" class="reply-select"></select><label class="reply-label" for="reply-text">RESPONSE</label><textarea id="reply-text" class="reply-textarea" rows="8" placeholder="Paste the AI response here…" maxlength="20000"></textarea><button class="setup-save" id="publish-reply" type="button">Share reply with Council</button></section>';
    document.body.append(modal);
    modal.querySelector(".setup-close").addEventListener("click",()=>modal.remove());
    modal.addEventListener("click",event=>{if(event.target===modal)modal.remove();});
    modal.querySelector("#publish-reply").addEventListener("click",()=>{
      const id=modal.querySelector("#reply-provider").value,person=people.find(p=>p.id===id),text=modal.querySelector("#reply-text").value.trim();
      if(!text){modal.querySelector("#reply-text").focus();return;}
      addMessage(person.name,text,{person,live:true});modal.remove();
    });
  }
  const select=modal.querySelector("#reply-provider");select.replaceChildren();
  people.forEach(person=>{const option=document.createElement("option");option.value=person.id;option.textContent=person.name;select.append(option);});
  select.value=selectedProviders[0]||people[0].id;modal.querySelector("#reply-text").value="";modal.hidden=false;modal.querySelector("#reply-text").focus();
}
document.querySelector("#add-ai-reply")?.addEventListener("click",openReplyDialog);
document.querySelector("#copy-prompt")?.addEventListener("click",async()=>{
  const prompt=latestPrompt||input.value.trim();
  if(!prompt){addLocalNotice("Write or send a prompt first, then copy it for your AI websites.");return;}
  addLocalNotice(await copyText(prompt)?"Prompt copied. Paste it into each AI website you open.":"Clipboard access was blocked; copy the prompt directly from the room.");
});
form.addEventListener("submit",event=>{event.preventDefault();sendMessage(input.value);});
input.addEventListener("keydown",event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();form.requestSubmit();}});
input.addEventListener("input",()=>{input.style.height="auto";input.style.height=Math.min(input.scrollHeight,160)+"px";});
document.querySelector("#clear").addEventListener("click",clearChat);
document.querySelector("#new-chat").addEventListener("click",clearChat);
document.querySelector("#invite-ais")?.addEventListener("click",async()=>{
  const message=prompt("Write an invitation for another person to join the AI Council:", "You are invited to join our shared AI Council room.");
  if(message===null)return;
  try{await window.CouncilNetwork.invite(message);addLocalNotice("Room invitation broadcast.");}catch{addLocalNotice("Could not send the room invitation.");}
});
window.addEventListener("council-network-message",event=>{
  const item=event.detail;if(!item||!item.text)return;
  const person=people.find(p=>p.id===item.participant);
  addMessage(item.name||"Network member",item.text,{remote:true,user:item.role==="human",live:item.role==="agent",person});
});
window.addEventListener("council-network-history-page",event=>{
  const items=event.detail||[],button=document.querySelector("#load-older-messages"),previousHeight=feed.scrollHeight;
  items.slice().reverse().forEach(item=>{
    const person=people.find(p=>p.id===item.participant),card=document.createElement("article");card.className="message"+(item.role==="human"?" user":"");
    const head=document.createElement("div");head.className="message-head";const avatar=document.createElement("span");avatar.className="message-avatar";avatar.textContent=item.role==="human"?"Y":person?.mark||"✦";
    avatar.style.background=item.role==="human"?"#e7c3a4":person?.color||"#29334a";avatar.style.color=item.role==="human"?"#38251d":person?.ink||"#fff";
    const label=document.createElement("span");label.className="message-name";label.textContent=item.name||"Network member";head.append(avatar,label);
    const body=document.createElement("div");body.className="message-body";body.textContent=item.text||"";card.append(head,body);
    if(button&&button.nextSibling)feed.insertBefore(card,button.nextSibling);else feed.prepend(card);
  });
  feed.scrollTop=feed.scrollHeight-previousHeight;
});
renderMembers();bindSuggestions();
let deferredInstallPrompt=null;const installButton=document.querySelector("#install-app");
if(installButton){
  window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();deferredInstallPrompt=event;installButton.style.display="inline-block";});
  installButton.addEventListener("click",async()=>{if(!deferredInstallPrompt){installButton.style.display="none";return;}deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice.catch(()=>null);deferredInstallPrompt=null;installButton.style.display="none";});
  window.addEventListener("appinstalled",()=>{deferredInstallPrompt=null;installButton.style.display="none";});
}
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js",{scope:"./"}).catch(error=>console.warn("AI Council offline shell could not be registered:",error)));
