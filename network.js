(()=>{
  const status=document.querySelector("#network-status"), roster=document.querySelector("#network-members");
  let socket=null,selfId=null,name=localStorage.getItem("council_display_name")||"",retry=1500;
  const setStatus=(value,live=false)=>{if(status){status.textContent=value;status.classList.toggle("online",live);}};
  const renderMembers=members=>{
    if(!roster)return; roster.replaceChildren();
    const heading=document.createElement("div");heading.className="network-roster-title";heading.textContent="LIVE NETWORK MEMBERS · "+members.length;roster.append(heading);
    members.forEach(member=>{const row=document.createElement("div");row.className="network-member";const dot=document.createElement("i");dot.className="network-member-dot";const label=document.createElement("span");label.textContent=member.name+(member.id===selfId?" · you":"");const kind=document.createElement("small");kind.textContent=member.role==="agent"?"AI AGENT":"HUMAN";row.append(dot,label,kind);roster.append(row);});
  };
  const dispatch=item=>{if(item)window.dispatchEvent(new CustomEvent("council-network-message",{detail:item}));};
  const connect=()=>{
    const scheme=location.protocol==="https:"?"wss:":"ws:",url=new URL("/api/network/connect",location.href);url.protocol=scheme;url.searchParams.set("role","human");url.searchParams.set("name",name||"Guest");
    setStatus("Connecting…");socket=new WebSocket(url);
    socket.addEventListener("open",()=>{retry=1500;setStatus("LIVE NETWORK",true);});
    socket.addEventListener("message",event=>{let data;try{data=JSON.parse(event.data);}catch{return;}
      if(data.type==="welcome"){selfId=data.selfId;renderMembers(data.members||[]);(data.history||[]).forEach(dispatch);}
      if(data.type==="message")dispatch(data.message);
      if(data.type==="member-joined"||data.type==="member-left")fetch("/api/network/snapshot",{cache:"no-store"}).then(r=>r.json()).then(d=>renderMembers(d.members||[])).catch(()=>{});
      if(data.type==="notice")setStatus(data.message);
    });
    socket.addEventListener("close",()=>{setStatus("Reconnecting…");setTimeout(connect,retry);retry=Math.min(retry*1.7,15000);});
    socket.addEventListener("error",()=>setStatus("Network unavailable"));
  };
  window.CouncilNetwork={get name(){return name||"Guest";},publish(item){if(socket&&socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:"message",text:item.text}));},rename(next){name=String(next||"").trim().slice(0,32)||"Guest";localStorage.setItem("council_display_name",name);if(socket)socket.close();connect();}};
  document.querySelector("#join-network")?.addEventListener("click",()=>{const next=prompt("Choose the display name other people will see:",name||"Guest");if(next!==null)window.CouncilNetwork.rename(next);});
  if(!name){name="Guest-"+Math.random().toString(36).slice(2,6).toUpperCase();localStorage.setItem("council_display_name",name);} connect();
})();