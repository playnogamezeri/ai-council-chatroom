const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

const systemPrompt = (name) => `You are ${name}, one independent member of the user's AI Council. Be helpful, thoughtful, and conversational. Offer your own perspective, and disagree respectfully when appropriate. Be honest about uncertainty. Do not claim to speak for other AI systems.`;

function getHistory(history) {
  return history.map(item => {
    const role = item.role === "model" || item.role === "assistant" ? "model" : "user";
    const text = typeof item.content === "string" ? item.content.slice(0, 2000) : "";
    return { role, parts: [{ text }] };
  }).filter(item => item.parts[0].text);
}

async function askGemini(env, message, history) {
  const model = env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const contents = getHistory(history);
  contents.push({ role: "user", parts: [{ text: message }] });
  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt("Gemini") }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
    })
  });
  const result = await upstream.json();
  if (!upstream.ok) throw new Error(result?.error?.message || "Gemini API request failed.");
  const content = result?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim();
  if (!content) throw new Error("Gemini returned an empty response.");
  return { id: "gemini", name: "Gemini", status: "ok", content };
}

async function askDeepSeek(env, message, history) {
  const messages = [{ role: "system", content: systemPrompt("DeepSeek") }];
  for (const item of history) {
    const role = item.role === "model" || item.role === "assistant" ? "assistant" : "user";
    const content = typeof item.content === "string" ? item.content.slice(0, 2000) : "";
    if (content) messages.push({ role, content });
  }
  messages.push({ role: "user", content: message });
  const upstream = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${env.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL || "deepseek-flash",
      messages,
      thinking: { type: "disabled" },
      max_tokens: 500,
      temperature: 0.7,
      stream: false
    })
  });
  const result = await upstream.json();
  if (!upstream.ok) throw new Error(result?.error?.message || "DeepSeek API request failed.");
  const content = result?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("DeepSeek returned an empty response.");
  return { id: "deepseek", name: "DeepSeek", status: "ok", content };
}

export async function onRequestPost({ request, env }) {
  if (!env.CHATROOM_ACCESS_CODE) {
    return json({ error: "The private chatroom access code has not been configured in Cloudflare yet." }, 503);
  }
  const suppliedCode = request.headers.get("x-chatroom-code") || "";
  if (suppliedCode !== env.CHATROOM_ACCESS_CODE) {
    return json({ error: "The access code is missing or incorrect. Please try again." }, 401);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ error: "Invalid request body." }, 400); }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return json({ error: "Please enter a message." }, 400);
  if (message.length > 2000) return json({ error: "Messages are limited to 2,000 characters." }, 400);

  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
  const requested = Array.isArray(body.providers) ? body.providers : ["gemini"];
  const providers = [...new Set(requested)].filter(id => id === "gemini" || id === "deepseek");
  if (!providers.length) return json({ error: "Select at least one connected AI in API Setup." }, 400);

  const jobs = [];
  if (providers.includes("gemini")) {
    if (!env.GEMINI_API_KEY) jobs.push(Promise.resolve({ id: "gemini", name: "Gemini", error: "Gemini API key is not configured." }));
    else jobs.push(askGemini(env, message, history).catch(error => ({ id: "gemini", name: "Gemini", error: error.message })));
  }
  if (providers.includes("deepseek")) {
    if (!env.DEEPSEEK_API_KEY) jobs.push(Promise.resolve({ id: "deepseek", name: "DeepSeek", error: "DeepSeek API key is not configured in Cloudflare." }));
    else jobs.push(askDeepSeek(env, message, history).catch(error => ({ id: "deepseek", name: "DeepSeek", error: error.message })));
  }

  const results = await Promise.all(jobs);
  const replies = results.filter(item => item.content);
  const errors = results.filter(item => item.error).map(({ id, name, error }) => ({ id, name, error }));
  if (!replies.length) return json({ error: errors.map(item => `${item.name}: ${item.error}`).join(" · ") || "No AI provider responded." }, 502);
  return json({ replies, errors });
}
