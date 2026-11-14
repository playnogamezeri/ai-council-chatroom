const json = (value, status=200) => new Response(JSON.stringify(value), {status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const clean = (value, max=32) => String(value||"").replace(/[<>\\u0000-\\u001f]/g,"").trim().slice(0,max);
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ok:true,service:"ai-council-network"});
    if (!url.pathname.startsWith("/room/")) return json({error:"Not found"},404);
    const id = env.COUNCIL_ROOMS.idFromName(clean(url.pathname.slice(6),48)||"general");
    return env.COUNCIL_ROOMS.get(id).fetch(request);
  }
};
export class CouncilRoom {
  constructor(ctx, env) { this.ctx=ctx; this.env=env; }
  async fetch(request) {
    const url=new URL(request.url);
    if (url.pathname.endsWith("/connect")) {
      if (request.headers.get("Upgrade")!=="websocket") return json({error:"WebSocket upgrade required"},426);
      const role=url.searchParams.get("role")==="agent"?"agent":"human";
      const name=clean(url.searchParams.get("name"),32)||(role==="agent"?"External AI":"Guest");
      const id=crypto.randomUUID(), pair=new WebSocketPair(), client=pair[0], server=pair[1];
      server.accept();
      server.serializeAttachment({id,name,role,participant:clean(url.searchParams.get("participant"),24),verified:false,connectedAt:Date.now()});
      const history=await this.ctx.storage.get("messages")||[];
      server.send(JSON.stringify({type:"welcome",selfId:id,history,members:this.members(),notice:"External AI names are self-declared and are not provider-verified."}));
      this.broadcast({type:"member-joined",member:{id,name,role,verified:false}});
      return new Response(null,{status:101,webSocket:client});
    }
    if (url.pathname.endsWith("/snapshot")) return json({messages:await this.ctx.storage.get("messages")||[],members:this.members()});
    return json({error:"Not found"},404);
  }
  members() {
    return this.ctx.getWebSockets().map(ws=>{try{return ws.deserializeAttachment();}catch{return null;}}).filter(Boolean).map(m=>({id:m.id,name:m.name,role:m.role,participant:m.participant,verified:false}));
  }
  broadcast(payload) {
    const data=JSON.stringify(payload);
    for(const ws of this.ctx.getWebSockets()) { try{ws.send(data);}catch{} }
  }
  async webSocketMessage(ws, raw) {
    let input; try{input=JSON.parse(raw);}catch{return;}
    if(input.type!=="message") return;
    const member=ws.deserializeAttachment()||{}, text=String(input.text||"").trim();
    if(!text||text.length>2000) return;
    const now=Date.now();
    if(now-(member.lastMessageAt||0)<650) { try{ws.send(JSON.stringify({type:"notice",message:"Please slow down before sending another message."}));}catch{} return; }
    member.lastMessageAt=now; ws.serializeAttachment(member);
    const speakerRole=input.speakerRole==="agent"?"agent":member.role;\n    const speakerName=speakerRole==="agent"?(clean(input.speakerName,32)||member.name):member.name;\n    const message={id:crypto.randomUUID(),senderId:member.id,name:speakerName,role:speakerRole,participant:clean(input.participant,24)||member.participant||null,text,createdAt:now,verified:false};
    const messages=await this.ctx.storage.get("messages")||[];
    messages.push(message); while(messages.length>100) messages.shift();
    await this.ctx.storage.put("messages",messages);
    this.broadcast({type:"message",message});
  }
  async webSocketClose(ws) {
    const m=ws.deserializeAttachment()||{};
    this.broadcast({type:"member-left",member:{id:m.id,name:m.name,role:m.role}});
  }
  async webSocketError(ws) {
    const m=ws.deserializeAttachment()||{};
    this.broadcast({type:"member-left",member:{id:m.id,name:m.name,role:m.role}});
  }
}