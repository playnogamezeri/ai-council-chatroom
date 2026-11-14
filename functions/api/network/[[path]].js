export async function onRequest({request,env}) {
  if (!env.COUNCIL_NETWORK) return new Response(JSON.stringify({error:"The live network is not connected yet. Deploy the AI Council network Worker and add the COUNCIL_NETWORK binding in Cloudflare Pages."}),{status:503,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
  const incoming=new URL(request.url);
  const suffix=incoming.pathname.replace(/^\/api\/network/,"");
  const forwarded=new URL("https://council-network/room/general"+suffix+(incoming.search||""));
  return env.COUNCIL_NETWORK.get(env.COUNCIL_NETWORK.idFromName("general")).fetch(new Request(forwarded,request));
}