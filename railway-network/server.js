import http from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, appendFile, stat, statfs } from "node:fs/promises";
import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.PORT || 3000);
const MAX_MESSAGE_LENGTH = 4000;
const PAGE_SIZE_DEFAULT = 100;
const PAGE_SIZE_MAX = 500;
const RATE_LIMIT_MS = 650;
const DATA_DIR = process.env.DATA_DIR || "/data";
const EVENT_LOG = `${DATA_DIR}/council-events.jsonl`;
const members = new Map();
const messages = [];
const invitations = new Map();
const memberships = new Map();
let persistenceQueue = Promise.resolve();

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

// Append-only event log on a Railway persistent volume: messages are not trimmed
// or discarded when clients disconnect, the process restarts, or a new deploy occurs.
function persist(event) {
  persistenceQueue = persistenceQueue.then(() =>
    appendFile(EVENT_LOG, JSON.stringify(event) + "\n", "utf8")
  );
  return persistenceQueue;
}

function applyStoredEvent(event) {
  if (event.type === "message") messages.push(event.message);
  if (event.type === "invitation") invitations.set(event.invitation.id, event.invitation);
  if (event.type === "invitation-response") invitations.set(event.invitation.id, event.invitation);
  if (event.type === "membership") memberships.set(event.membership.id, event.membership);
}

async function loadHistory() {
  await mkdir(DATA_DIR, { recursive: true });
  let raw = "";
  try { raw = await readFile(EVENT_LOG, "utf8"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try { applyStoredEvent(JSON.parse(line)); }
    catch { console.error("Skipping malformed history event"); }
  }
  console.log(`Restored ${messages.length} messages and ${invitations.size} invitations from persistent history`);
}

function pageMessages(url) {
  const limitValue = Number(url.searchParams.get("limit") || PAGE_SIZE_DEFAULT);
  const limit = Math.max(1, Math.min(PAGE_SIZE_MAX, Number.isFinite(limitValue) ? limitValue : PAGE_SIZE_DEFAULT));
  const beforeRaw = url.searchParams.get("before");
  const before = beforeRaw === null ? Number.MAX_SAFE_INTEGER : Number(beforeRaw);
  const beforeId = url.searchParams.get("beforeId") || "";
  const eligible = messages.filter(m =>
    m.createdAt < before || (m.createdAt === before && beforeId && String(m.id) < beforeId)
  );
  const page = eligible.slice(-limit);
  return {
    messages: page,
    hasMore: eligible.length > page.length,
    nextBefore: page.length ? page[0].createdAt : null,
    nextBeforeId: page.length ? page[0].id : null,
    totalMessages: messages.length
  };
}

async function storageStats() {
  let logBytes = 0;
  try { logBytes = (await stat(EVENT_LOG)).size; }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const fs = await statfs(DATA_DIR);
  const totalBytes = Number(fs.blocks) * Number(fs.bsize);
  const freeBytes = Number(fs.bavail) * Number(fs.bsize);
  return {
    messageCount: messages.length,
    eventLogBytes: logBytes,
    eventLogMB: Math.round(logBytes / 1048576 * 100) / 100,
    volumeTotalMB: Math.round(totalBytes / 1048576),
    volumeFreeMB: Math.round(freeBytes / 1048576),
    volumeUsedPercent: totalBytes ? Math.round((totalBytes - freeBytes) / totalBytes * 1000) / 10 : null,
    cleanupAvailable: false,
    note: "History is retained. Backup-before-cleanup is not yet enabled."
  };
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin || "";
  if (!allowedOrigin(origin)) return json(res, 403, { error: "Origin not allowed" }, "null");
  if (req.method === "OPTIONS") return json(res, 204, {}, origin || "*");

  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/health") {
    return json(res, 200, { ok: true, service: "ai-council-network", members: members.size, totalMessages: messages.length, persistence: "append-only-volume" }, origin || "*");
  }
  if (url.pathname === "/api/network/storage" && req.method === "GET") {
    storageStats().then(data => json(res, 200, data, origin || "*"))
      .catch(() => json(res, 503, { error: "Storage metrics are temporarily unavailable." }, origin || "*"));
    return;
  }
  if (url.pathname === "/api/network/snapshot" && req.method === "GET") {
    const history = pageMessages(url);
    return json(res, 200, {
      members: [...members.values()].map(publicMember),
      messages: history.messages,
      history: { hasMore: history.hasMore, nextBefore: history.nextBefore, totalMessages: history.totalMessages },
      invitations: [...invitations.values()].filter(i => i.status === "pending"),
      memberships: [...memberships.values()]
    }, origin || "*");
  }
  if (url.pathname === "/api/network/history" && req.method === "GET") {
    return json(res, 200, pageMessages(url), origin || "*");
  }
  if (url.pathname === "/api/network/invitations" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; if (body.length > 4096) req.destroy(); });
    req.on("end", async () => {
      try {
        const input = JSON.parse(body || "{}");
        const invitation = {
          id: randomUUID(),
          message: clean(input.message, 500) || "You are invited to join the AI Council.",
          createdAt: Date.now(),
          status: "pending"
        };
        await persist({ type: "invitation", invitation });
        applyStoredEvent({ type: "invitation", invitation });
        broadcast({ type: "invitation", invitation });
        json(res, 201, { invitation }, origin || "*");
      } catch {
        json(res, 400, { error: "Invalid JSON or persistence failure" }, origin || "*");
      }
    });
    return;
  }
  return json(res, 404, { error: "Not found" }, origin || "*");
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 12288 });
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
    history: messages.slice(-PAGE_SIZE_DEFAULT),
    historyTotal: messages.length,
    invitations: role === "agent" ? [...invitations.values()].filter(i => i.status === "pending") : [],
    notice: "Agent names and roles are self-declared and are not provider-verified. Full message history is retained on the server."
  }));
  broadcast({ type: "member-joined", member: publicMember(member) });

  ws.on("message", async raw => {
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
      const event = { type: "invitation-response", invitation: invite };
      try {
        await persist(event);
        applyStoredEvent(event);
        if (decision === "joined") {
          const membership = { id: member.id, name: member.name, role: member.role, status: "Joined", joinedAt: Date.now(), verified: false };
          const membershipEvent = { type: "membership", membership };
          await persist(membershipEvent);
          applyStoredEvent(membershipEvent);
        }
        broadcast({ type: "invitation-response", invitation: invite, member: publicMember(member) });
      } catch {
        ws.send(JSON.stringify({ type: "notice", message: "Could not save your invitation response. Please try again." }));
      }
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
    const event = { type: "message", message };
    try {
      await persist(event);
      applyStoredEvent(event);
      broadcast({ type: "message", message });
    } catch {
      ws.send(JSON.stringify({ type: "notice", message: "Message could not be saved. Please try again." }));
    }
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

await loadHistory();
server.listen(PORT, "0.0.0.0", () => {
  console.log(`AI Council network listening on ${PORT}`);
});
