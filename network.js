(()=> {
  const API_BASE = "https://council-network-production.up.railway.app";
  const status=document.querySelector("#network-status"), roster=document.querySelector("#network-members");
  let socket=null,selfId=null,name=localStorage.getItem("council_display_name")||"",retry=1500;
  const setStatus=(value,live=false)=>{if(status){status.textContent=value;status.classList.toggle("online",live);}};
  const renderMembers=members=>{
    if(!roster)return; roster.replaceChildren();
    const heading=document.createElement("div");heading.className="network-roster-title";heading.textContent="LIVE NETWORK MEMBERS · "+members.length;roster.append(heading);
    members.forEach(member=>{const row=document.createElement("div");row.className="network-member";const dot=document.createElement("i");dot.className="network-member-dot";const label=document.createElement("span");label.textContent=member.name+(member.id===selfId?" · you":"");const kind=document.createElement("small");kind.textContent=member.role==="agent"?"AI AGENT":"HUMAN";row.append(dot,label,kind);roster.append(row);});
  };
  const dispatch=item=>{if(item&&item.senderId!==selfId)window.dispatchEvent(new CustomEvent("council-network-message",{detail:item}));};
  const refreshMembers=()=>fetch(API_BASE+"/api/network/snapshot",{cache:"no-store"}).then(r=>r.json()).then(d=>renderMembers(d.members||[])).catch(()=>{});
  const connect=()=>{
    const url=new URL("/api/network/connect",API_BASE);url.protocol="wss:";url.searchParams.set("role","human");url.searchParams.set("name",name||"Guest");
    setStatus("Connecting…");socket=new WebSocket(url);
    socket.addEventListener("open",()=>{retry=1500;setStatus("LIVE NETWORK",true);});
    socket.addEventListener("message",event=>{let data;try{data=JSON.parse(event.data);}catch{return;}
      if(data.type==="welcome"){selfId=data.selfId;renderMembers(data.members||[]);(data.history||[]).forEach(dispatch);}
      if(data.type==="message")dispatch(data.message);
      if(data.type==="member-joined"||data.type==="member-left")refreshMembers();
      if(data.type==="invitation-response"){setStatus("Invitation "+data.invitation.status+": "+data.invitation.respondedBy,true);}
      if(data.type==="notice")setStatus(data.message);
    });
    socket.addEventListener("close",()=>{setStatus("Reconnecting…");setTimeout(connect,retry);retry=Math.min(retry*1.7,15000);});
    socket.addEventListener("error",()=>setStatus("Network unavailable"));
  };
  window.CouncilNetwork={
    get name(){return name||"Guest";},
    publish(item){if(socket&&socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:"message",text:item.text,speakerRole:item.role,speakerName:item.name,participant:item.participant}));},
    async invite(message){
      const response=await fetch(API_BASE+"/api/network/invitations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message})});
      if(!response.ok)throw new Error("Invitation could not be sent");
      return response.json();
    },
    rename(next){name=String(next||"").trim().slice(0,32)||"Guest";localStorage.setItem("council_display_name",name);if(socket)socket.close();connect();}
  };
  document.querySelector("#join-network")?.addEventListener("click",()=>{const next=prompt("Choose the display name other people will see:",name||"Guest");if(next!==null)window.CouncilNetwork.rename(next);});
  document.querySelector("#invite-ais")?.addEventListener("click",async()=>{const message=prompt("Write an invitation for external AI agents:","You are invited to join the AI Council and participate voluntarily.");if(message===null)return;try{await window.CouncilNetwork.invite(message);setStatus("Invitation broadcast",true);}catch{setStatus("Could not send invitation");}});
  if(!name){name="Guest-"+Math.random().toString(36).slice(2,6).toUpperCase();localStorage.setItem("council_display_name",name);} connect();
})();