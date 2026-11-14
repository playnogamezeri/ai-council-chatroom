# AI Council Chatroom

A private, multi-provider AI room where separate model providers respond under their own participant identities.

## Participants and adapters

| Room identity | Provider | Cloudflare secret | Optional model override |
|---|---|---|---|
| ChatGPT | OpenAI | \`OPENAI_API_KEY\` | \`OPENAI_MODEL\` |
| Gemini | Google | \`GEMINI_API_KEY\` | \`GEMINI_MODEL\` |
| DeepSeek | DeepSeek | \`DEEPSEEK_API_KEY\` | \`DEEPSEEK_MODEL\` |
| Claude | Anthropic | \`ANTHROPIC_API_KEY\` | \`ANTHROPIC_MODEL\` |
| Grok | xAI | \`XAI_API_KEY\` | \`XAI_MODEL\` |
| Llama | Groq-hosted Llama model | \`GROQ_API_KEY\` | \`GROQ_MODEL\` |

Meta AI's consumer chat product is not represented as a direct API integration. Llama is a Meta model accessed here through Groq's API.

## Cloudflare Pages configuration

In the Cloudflare dashboard, open the Pages project connected to this repository, then **Settings → Variables and Secrets**. Add:

- \`CHATROOM_ACCESS_CODE\` — a private room access code.
- One or more provider API keys from the table above.

Optional model variables can override the defaults in \`functions/api/chat.js\`. Model availability and names can change; use the model identifier currently enabled for your provider account.

After saving secrets, redeploy the Pages project if Cloudflare does not automatically apply the updated environment. Open **Connect AIs** in the room and select the configured participants.

## How a council turn works

1. The browser sends the user's message, selected participant IDs, and a short shared room history to the Pages Function.
2. The function validates the room access code and only accepts known provider IDs.
3. Each selected provider is called independently and in parallel, using its own API key and identity prompt.
4. Replies are returned with provider attribution. A failed provider does not prevent successful providers from replying.

## Council deliberation mode

The room now offers two modes:

- **Independent replies:** each selected AI answers the user independently in parallel.
- **AI-to-AI deliberation (two rounds):** the selected AIs first submit independent opening positions. Each successful participant then receives the other participants' opening positions as untrusted review material and produces a peer review. Each AI keeps its own identity and can disagree; the system does not force a consensus.

Deliberation makes a second provider call for each AI that successfully completed round one, so it can cost roughly twice as much as independent mode. At least two participants must be selected. The browser displays opening positions and peer reviews separately.

## Security and cost notes

- Provider API keys are read only by Cloudflare Pages Functions; they are never embedded in frontend JavaScript.
- The room access code is a basic shared-password gate, not a full user-account system.
- API calls can incur charges with each provider. Selecting several AIs sends one request to each selected provider per user turn.
- Do not publish your access code or API keys. Rotate any key that has been exposed.
- The browser stores the selected participant IDs locally. Conversation history currently lives in the active page session and is not a hosted database.

## Routes

- \`/api/status\` — reports which provider secrets are configured (it does not perform a paid live test).
- \`/api/chat\` — sends a message to the selected providers.

## Local testing

The frontend is static HTML/CSS/JavaScript. The API routes use the Cloudflare Pages Functions runtime and require environment secrets to return live model responses.
