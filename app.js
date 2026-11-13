const people=[
  {id:"chatgpt",name:"ChatGPT",mark:"C",role:"Reasoning & ideas",color:"#d6f6e9",ink:"#17654a"},
  {id:"gemini",name:"Gemini",mark:"✦",role:"Research & synthesis",color:"#dce8ff",ink:"#315db2"},
  {id:"deepseek",name:"DeepSeek",mark:"D",role:"Logic & problem-solving",color:"#d8eaff",ink:"#245d9b"},
  {id:"meta",name:"Meta AI",mark:"∞",role:"Practical perspectives",color:"#d9e9ff",ink:"#245b9e"},
  {id:"grok",name:"Grok",mark:"X",role:"Challenge & creativity",color:"#e5e7eb",ink:"#242832"}
];
const memberBox=document.querySelector("#members");
const feed=document.querySelector("#feed");
const form=document.querySelector("#form");
const input=document.querySelector("#message");
const send=document.querySelector("#send");
let conversation=[];

people.forEach(p=>{
  const el=document.createElement("div");el.className="member";
  const av=document.createElement("div");av.className="member-avatar";av.textContent=p.mark;av.style.background=p.color;av.style.color=p.ink;
  const info=document.createElement("div");info.className="member-info";
  const name=document.createElement("strong");name.textContent=p.name;
  const role=document.createElement("small");role.textContent=p.role;
  info.append(name,role);
  const state=document.createElement("span");state.className="member-state demo";state.title="Demo participant";
  el.append(av,info,state);memberBox.append(el);
});
function addMessage(name,text,isUser=false,person=null){
  document.querySelector("#welcome")?.remove();
  const card=document.createElement("article");card.className="message"+(isUser?" user":"");
  const head=document.createElement("div");head.className="message-head";
  const av=document.createElement("span");av.className="message-avatar";
  av.textContent=isUser?"Y":person.mark;
  av.style.background=isUser?"#e7c3a4":person.color;
  av.style.color=isUser?"#38251d":person.ink;
  const nm=document.createElement("span");nm.className="message-name";nm.textContent=name;
  head.append(av,nm);
  if(!isUser){const tag=document.createElement("span");tag.className="message-tag";tag.textContent="SIMULATED";head.append(tag);}
  const body=document.createElement("div");body.className="message-body";body.textContent=text;
  card.append(head,body);feed.append(card);feed.scrollTop=feed.scrollHeight;
}
function makeReplies(message){
  const lower=message.toLowerCase();
  return [
    [people[0],`I'd begin by clarifying the goal: “${message}” We can break it into smaller questions, compare the options, and decide what evidence would help.`],
    [people[1],"A broader perspective may help here. What context, constraints, or longer-term effects should we include before settling on an answer?"],
    [people[2],"Let's examine the assumptions and structure the problem. I would test the key claims one by one before choosing a solution."],
    [people[3],"I'd keep the discussion grounded in practical outcomes. Let's identify who this affects, what success looks like, and the next useful action."],
    [people[4],lower.includes("agree")?"I'm not convinced agreement should be the goal. Let's challenge the strongest assumption and see whether the argument holds up.":"Here's a counterpoint: what might we be overlooking? A useful discussion should make room for a competing explanation."]
  ];
}
function showTyping(){
  const el=document.createElement("div");el.className="typing";el.id="typing";
  el.innerHTML="<i></i><i></i><i></i><span>The council is thinking…</span>";
  feed.append(el);feed.scrollTop=feed.scrollHeight;return el;
}
async function sendMessage(text){
  const message=text.trim();if(!message||send.disabled)return;
  addMessage("You",message,true);
  conversation.push({role:"user",content:message});
  input.value="";input.style.height="auto";
  send.disabled=true;
  const typing=showTyping();
  await new Promise(resolve=>setTimeout(resolve,650));
  typing.remove();
  const replies=makeReplies(message);
  for(let i=0;i<replies.length;i++){
    const [person,reply]=replies[i];
    await new Promise(resolve=>setTimeout(resolve,180));
    addMessage(person.name,reply,false,person);
    conversation.push({role:"assistant",name:person.name,content:reply});
  }
  conversation=conversation.slice(-24);
  send.disabled=false;input.focus();
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
