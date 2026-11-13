const json = (data) => new Response(JSON.stringify(data), {
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

export async function onRequestGet({ env }) {
  const accessReady = Boolean(env.CHATROOM_ACCESS_CODE);
  return json({
    mode: "live-ready",
    participants: [
      { id: "chatgpt", name: "ChatGPT", configured: false, connected: false, note: "No API key configured" },
      { id: "gemini", name: "Gemini", configured: Boolean(env.GEMINI_API_KEY && accessReady), connected: Boolean(env.GEMINI_API_KEY && accessReady), note: env.GEMINI_API_KEY ? "API key stored" : "Add GEMINI_API_KEY in Cloudflare" },
      { id: "deepseek", name: "DeepSeek", configured: Boolean(env.DEEPSEEK_API_KEY && accessReady), connected: false, note: env.DEEPSEEK_API_KEY ? "API key stored · enable replies in API Setup" : "Add DEEPSEEK_API_KEY in Cloudflare" },
      { id: "meta", name: "Meta AI", configured: false, connected: false, note: "No supported API configured" },
      { id: "grok", name: "Grok", configured: false, connected: false, note: "No API key configured" }
    ]
  });
}
