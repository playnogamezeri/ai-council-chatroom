const json = (data) => new Response(JSON.stringify(data), {
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

export async function onRequestGet({ env }) {
  return json({
    mode: "live-ready",
    participants: [
      { id: "chatgpt", name: "ChatGPT", connected: false, note: "Not configured" },
      { id: "gemini", name: "Gemini", connected: Boolean(env.GEMINI_API_KEY && env.CHATROOM_ACCESS_CODE), note: "First live provider" },
      { id: "deepseek", name: "DeepSeek", connected: false, note: "Not configured" },
      { id: "meta", name: "Meta AI", connected: false, note: "Not configured" },
      { id: "grok", name: "Grok", connected: false, note: "Not configured" }
    ]
  });
}
