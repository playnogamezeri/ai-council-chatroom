import http from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.PORT || 3000);
const MAX_MESSAGE_LENGTH = 2000;
const HISTORY_LIMIT = 100;
const RATE_LIMIT_MS = 650;
const members = new Map();
const messages = [];
const invitations = new Map();

function clean(value, max = 32) {
  return String(value ?? "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, max);
}

function json(res, status, body, origin = "*") {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(JSON.stringify(body));
}

function allowedOrigin(origin) {
  const configured = (process.env.ALLOWED_ORIGINS || "").split(",").map(v => v.trim()).filter(Boolean);
  if (!origin) return true;
  if (configured.includes("*") || configured.includes(origin)) return true;
  try {
    const u = new URL(origin);
    return u.hostname.endsWith(".pages.dev") || u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch { return false; }
}

function publicMember(m) {
  return { id: m.id, name: m.name, role: m.role, participant: m.participant || null, verified: false };
}

function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const ws of members.keys()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin || "";
  if (!allowedOrigin(origin)) return json(res, 403, { error: "Origin not allowed" }, "null");
  if (req.method === "OPTIONS") return json(res, 204, {}, origin || "*");

  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/health") {
    return json(res, 200, { ok: true, service: "ai-council-network", members: members.size }, origin || "*");
  }
  if (url.pathname === "/api/network/snapshot" && req.method === "GET") {
    return json(res, 200, {
      members: [...members.values()].map(publicMember),
      messages,
      invitations: [...invitations.values()].filter(i => i.status === "pending")
    }, origin || "*");
  }
  if (url.pathname === "/api/network/invitations" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; if (body.length > 4096) req.destroy(); });
    req.on("end", () => {
      try {
        const input = JSON.parse(body || "{}");
        const invitation = {
          id: randomUUID(),
          message: clean(input.message, 500) || "You are invited to join the AI Council.",
          createdAt: Date.now(),
          status: "pending"
        };
        invitations.set(invitation.id, invitation);
        broadcast({ type: "invitation", invitation });
        json(res, 201, { invitation }, origin || "*");
      } catch {
        json(res, 400, { error: "Invalid JSON" }, origin || "*");
      }
    });
    return;
  }
  return json(res, 404, { error: "Not found" }, origin || "*");
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 8192 });
server.on("upgrade", (req, socket, head) => {
  const origin = req.headers.origin || "";
  if (!allowedOrigin(origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  const url = new URL(req.url, "http://localhost");
  if (url.pathname !== "/api/network/connect") {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req, url));
});

wss.on("connection", (ws, req, url) => {
  const role = url.searchParams.get("role") === "agent" ? "agent" : "human";
  const member = {
    id: randomUUID(),
    name: clean(url.searchParams.get("name"), 32) || (role === "agent" ? "External AI" : "Guest"),
    role,
    participant: clean(url.searchParams.get("participant"), 24),
    connectedAt: Date.now(),
    lastMessageAt: 0
  };
  members.set(ws, member);

  ws.send(JSON.stringify({
    type: "welcome",
    selfId: member.id,
    members: [...members.values()].map(publicMember),
    history: messages,
    invitations: role === "agent" ? [...invitations.values()].filter(i => i.status === "pending") : [],
    notice: "Agent names and roles are self-declared and are not provider-verified."
  }));
  broadcast({ type: "member-joined", member: publicMember(member) });

  ws.on("message", raw => {
    let input;
    try { input = JSON.parse(raw.toString()); } catch { return; }
    if (input.type === "invite-response") {
      const invite = invitations.get(String(input.invitationId || ""));
      if (!invite || invite.status !== "pending" || member.role !== "agent") return;
      const decision = ["joined", "declined"].includes(input.decision) ? input.decision : null;
      if (!decision) return;
      invite.status = decision;
      invite.respondedBy = member.name;
      invite.respondedAt = Date.now();
      broadcast({ type: "invitation-response", invitation: invite, member: publicMember(member) });
      return;
    }
    if (input.type !== "message") return;
    const text = String(input.text || "").trim();
    if (!text || text.length > MAX_MESSAGE_LENGTH) return;
    const now = Date.now();
    if (now - member.lastMessageAt < RATE_LIMIT_MS) {
      ws.send(JSON.stringify({ type: "notice", message: "Please slow down before sending another message." }));
      return;
    }
    member.lastMessageAt = now;
    const claimedAgent = input.speakerRole === "agent";
    const message = {
      id: randomUUID(),
      senderId: member.id,
      name: claimedAgent ? clean(input.speakerName, 32) || member.name : member.name,
      role: claimedAgent ? "agent" : member.role,
      participant: clean(input.participant, 24) || member.participant || null,
      text,
      createdAt: now,
      verified: false
    };
    messages.push(message);
    while (messages.length > HISTORY_LIMIT) messages.shift();
    broadcast({ type: "message", message });
  });

  ws.on("close", () => {
    members.delete(ws);
    broadcast({ type: "member-left", member: publicMember(member) });
  });
  ws.on("error", () => {
    members.delete(ws);
    broadcast({ type: "member-left", member: publicMember(member) });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`AI Council network listening on ${PORT}`);
});
