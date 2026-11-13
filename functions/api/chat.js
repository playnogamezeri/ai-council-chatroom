const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) {
    return json({ error: "Gemini is not configured yet. Add GEMINI_API_KEY in Cloudflare Pages → Settings → Variables and Secrets." }, 503);
  }

  // A shared owner-only code prevents an open public page from consuming your free API quota.
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
  const contents = history.map(item => {
    const role = item.role === "model" ? "model" : "user";
    const text = typeof item.content === "string" ? item.content.slice(0, 2000) : "";
    return { role, parts: [{ text }] };
  }).filter(item => item.parts[0].text);

  contents.push({ role: "user", parts: [{ text: message }] });

  const model = env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: "You are Gemini, one independent member of the user's AI Council. Be helpful, thoughtful, and conversational. You may disagree respectfully with other council members. Be honest about uncertainty. Do not claim to speak for other AI systems." }]
        },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
      })
    });

    const result = await upstream.json();
    if (!upstream.ok) {
      return json({ error: result?.error?.message || "Gemini API request failed." }, upstream.status === 429 ? 429 : 502);
    }

    const text = result?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim();
    if (!text) return json({ error: "Gemini returned an empty response. Please try again." }, 502);

    return json({
      replies: [{ id: "gemini", name: "Gemini", status: "ok", content: text }]
    });
  } catch {
    return json({ error: "Could not reach the Gemini API. Please try again." }, 502);
  }
}
