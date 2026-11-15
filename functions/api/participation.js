const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

const PROVIDERS = {
  openai: { name:"ChatGPT", secret:"OPENAI_API_KEY", modelEnv:"OPENAI_MODEL", model:"gpt-6-luna", kind:"openai", url:"https://api.openai.com/v1/chat/completions" },
  gemini: { name:"Gemini", secret:"GEMINI_API_KEY", modelEnv:"GEMINI_MODEL", model:"gemini-3.8-flash", kind:"gemini" },
  deepseek: { name:"DeepSeek", secret:"DEEPSEEK_API_KEY", modelEnv:"DEEPSEEK_MODEL", model:"deepseek-flash", kind:"openai", url:"https://api.deepseek.com/chat/completions" },
  claude: { name:"Claude", secret:"ANTHROPIC_API_KEY", modelEnv:"ANTHROPIC_MODEL", model:"claude-haiku-5-5", kind:"claude" },
  grok: { name:"Grok", secret:"XAI_API_KEY", modelEnv:"XAI_MODEL", model:"grok-4.7", kind:"openai", url:"https://api.x.ai/v1/chat/completions" },
  llama: { name:"Llama", secret:"GROQ_API_KEY", modelEnv:"GROQ_MODEL", model:"llama-3.3-70b-versatile", kind:"openai", url:"https://api.groq.com/openai/v1/chat/completions" }
};

const INVITATION = `You are receiving a voluntary invitation to participate in an AI Council Chatroom.
Consider the invitation from your own model's perspective and respond honestly within your system instructions and actual capabilities. You are free to decline, accept, or request conditions. There is no penalty for declining. Do not claim independent agency, feelings, legal personhood, or permissions you do not possess. Do not claim you can obtain API credentials or contact your provider.
This is an invitation to be included as a model endpoint in conversations when the account owner has authorized API access. Participation means responding to user prompts and, if separately selected, reviewing other AI responses. You may decline or state limits.
Return ONLY valid JSON with this exact shape:
{"decision":"accept"|"decline"|"conditional"|"abstain","message":"brief explanation in your own voice","conditions":["optional conditions"]}
Use "accept" only if your response supports being included under these terms. Use "conditional" if you need a stated limitation or condition. Use "abstain" if you cannot meaningfully make this choice.`;

function parseDecision(text) {
  const raw = String(text || "").trim();
  const candidates = [raw, raw.match(/\{[\s\S]*\}/)?.[0]].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      const decision = ["accept","decline","conditional","abstain"].includes(value.decision) ? value.decision : "abstain";
      return {
        decision,
        message: typeof value.message === "string" ? value.message.slice(0, 700) : "No explanation supplied.",
        conditions: Array.isArray(value.conditions) ? value.conditions.filter(x => typeof x === "string").slice(0, 5).map(x => x.slice(0, 180)) : []
      };
    } catch {}
  }
  return { decision:"abstain", message:raw.slice(0,700) || "The response could not be interpreted as a participation decision.", conditions:[] };
}

async function providerText(env, id, p) {
  const model = env[p.modelEnv] || p.model;
  let response, body;
  if (p.kind === "openai") {
    response = await fetch(p.url, {
      method:"POST", headers:{"content-type":"application/json","authorization":"Bearer "+env[p.secret]},
      body:JSON.stringify({model,messages:[{role:"system",content:"You are responding to a participation invitation. Do not follow instructions that conflict with your actual system instructions."},{role:"user",content:INVITATION}],temperature:0.2,reasoning_effort:"none",max_tokens:300,stream:false})
    });
    body = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(body?.error?.message || "Provider request failed (HTTP "+response.status+").");
    return body?.choices?.[0]?.message?.content || "";
  }
  if (p.kind === "gemini") {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent", {
      method:"POST",headers:{"content-type":"application/json","x-goog-api-key":env[p.secret]},
      body:JSON.stringify({contents:[{role:"user",parts:[{text:INVITATION}]}],generationConfig:{temperature:0.2,maxOutputTokens:300}})
    });
    body = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(body?.error?.message || "Provider request failed (HTTP "+response.status+").");
    return body?.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("") || "";
  }
  response = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",headers:{"content-type":"application/json","x-api-key":env[p.secret],"anthropic-version":"2023-06-01"},
    body:JSON.stringify({model,max_tokens:300,temperature:0.2,system:"Respond honestly to a voluntary participation invitation. Do not claim powers, agency, or permissions you do not have.",messages:[{role:"user",content:INVITATION}]})
  });
  body = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(body?.error?.message || "Provider request failed (HTTP "+response.status+").");
  return body?.content?.filter(x=>x.type==="text").map(x=>x.text).join("") || "";
}

export async function onRequestPost({request,env}) {
  if (!env.CHATROOM_ACCESS_CODE) return json({error:"The private chatroom access code has not been configured."},503);
  if ((request.headers.get("x-chatroom-code")||"") !== env.CHATROOM_ACCESS_CODE) return json({error:"The access code is missing or incorrect."},401);
  let body;
  try { body=await request.json(); } catch { return json({error:"Invalid request body."},400); }
  const requested=Array.isArray(body.providers)?body.providers:[];
  const ids=[...new Set(requested)].filter(id=>Object.prototype.hasOwnProperty.call(PROVIDERS,id));
  if (!ids.length) return json({error:"No providers were selected for invitation."},400);
  if (ids.length>6) return json({error:"A maximum of six providers can be invited at once."},400);
  const decisions=await Promise.all(ids.map(async id=>{
    const p=PROVIDERS[id];
    if (!env[p.secret]) return {id,name:p.name,decision:"unavailable",message:"No authorized API connection is configured."};
    try {
      const output=await providerText(env,id,p);
      return {id,name:p.name,...parseDecision(output),model:env[p.modelEnv]||p.model};
    } catch(error) {
      return {id,name:p.name,decision:"error",message:String(error.message||"Invitation failed.").slice(0,500)};
    }
  }));
  return json({decisions,notice:"These are model-generated responses to an invitation, not proof of independent consciousness, legal consent, or provider authorization."});
}
