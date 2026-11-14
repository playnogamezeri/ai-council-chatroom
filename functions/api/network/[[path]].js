export async function onRequest({request,env}) {
  if (!env.COUNCIL_NETWORK) return new Response(JSON.stringify({error:"The live network is not connected yet. Deploy the AI Council network Worker and add the COUNCIL_NETWORK binding in Cloudflare Pages."}),{status:503,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
  const room=env.COUNCIL_NETWORK.idFromName("general");
  return env.COUNCIL_NETWORK.get(room).fetch(request);
}
