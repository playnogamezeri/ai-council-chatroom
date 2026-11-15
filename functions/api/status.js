const json = (data) => new Response(JSON.stringify(data), {
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

const participants = [
  { id: "openai", name: "ChatGPT", secret: "OPENAI_API_KEY", model: "OPENAI_MODEL", fallback: "gpt-6-luna" },
  { id: "gemini", name: "Gemini", secret: "GEMINI_API_KEY", model: "GEMINI_MODEL", fallback: "gemini-3.8-flash" },
  { id: "deepseek", name: "DeepSeek", secret: "DEEPSEEK_API_KEY", model: "DEEPSEEK_MODEL", fallback: "deepseek-flash" },
  { id: "claude", name: "Claude", secret: "ANTHROPIC_API_KEY", model: "ANTHROPIC_MODEL", fallback: "claude-haiku-5-5" },
  { id: "grok", name: "Grok", secret: "XAI_API_KEY", model: "XAI_MODEL", fallback: "grok-4.7" },
  { id: "llama", name: "Llama", secret: "GROQ_API_KEY", model: "GROQ_MODEL", fallback: "llama-3.3-70b-versatile" }
];

export async function onRequestGet({ env }) {
  const accessReady = Boolean(env.CHATROOM_ACCESS_CODE);
  return json({
    mode: "multi-provider",
    accessReady,
    participants: participants.map(person => ({
      id: person.id,
      name: person.name,
      configured: Boolean(env[person.secret]),
      connected: Boolean(env[person.secret] && accessReady),
      model: env[person.model] || person.fallback,
      secretName: person.secret
    }))
  });
}
