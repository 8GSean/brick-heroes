// Brick Heroes co-op relay server.
// A plain Cloudflare Worker + one Durable Object ("Room") per room code.
// The server does not understand the game: it hands out ids/slots, relays
// messages between players, and remembers a small "world" map for late joiners.
// See PROTOCOL.md for the message format.

import { DurableObject } from 'cloudflare:workers';

const CONFIG = {
  MAX_PLAYERS: 12,            // hard cap per room (slots 0..11)
  MAX_MSG_BYTES: 2048,        // bigger messages are dropped
  MAX_MSGS_PER_SEC: 40,       // above this, messages are dropped
  KICK_MSGS_PER_SEC: 200,     // way above this, the socket is closed
  MAX_WORLD_ENTRIES: 500,     // persisted world keys per room
  MAX_KEY_LEN: 64,
  MAX_NAME_LEN: 24,
  MAX_HERO_LEN: 32,
  MAX_STORED_STATE_BYTES: 1200, // latest state kept for welcome snapshots (attachment limit is 2 KB)
  STATE_SAVE_MS: 500,         // how often latest state is copied into the attachment
  EMPTY_ROOM_WIPE_MS: 30 * 60 * 1000, // wipe world 30 min after the last player leaves (env EMPTY_ROOM_WIPE_SECONDS overrides)
};

const ROOM_RE = /^[a-z0-9-]{1,24}$/;
const WORLD_PREFIX = 'w:';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '') {
      return new Response('Brick Heroes co-op server OK\n', {
        headers: { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' },
      });
    }

    const m = url.pathname.match(/^\/room\/([^/]+)\/?$/);
    if (!m) return new Response('Not found\n', { status: 404 });

    const code = decodeURIComponent(m[1]);
    if (!ROOM_RE.test(code)) {
      return new Response('Bad room code (use 1-24 of a-z 0-9 -)\n', { status: 400 });
    }
    if (request.method !== 'GET' || (request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade\n', { status: 426 });
    }

    const allowed = String(env.ALLOWED_ORIGINS || '')
      .split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
    if (allowed.length) {
      const origin = request.headers.get('Origin') || '';
      if (!allowed.includes(origin)) return new Response('Origin not allowed\n', { status: 403 });
    }

    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    return stub.fetch(request);
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.world = new Map();   // key -> value (mirror of storage)
    this.nextId = 1;
    this.rate = new Map();    // ws -> { sec, n } (in memory only; fine to lose on hibernation)
    this.lastSave = new Map(); // ws -> ms of last state save into attachment
    // Exact '{"t":"ping"}' is answered without waking the object.
    try {
      ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
    } catch (e) { /* older runtimes: handled in webSocketMessage */ }
    ctx.blockConcurrencyWhile(async () => {
      const entries = await ctx.storage.list({ prefix: WORLD_PREFIX });
      for (const [k, v] of entries) this.world.set(k.slice(WORLD_PREFIX.length), v);
      this.nextId = (await ctx.storage.get('nextId')) || 1;
    });
  }

  // Open sockets that belong to players (not the one that is closing).
  players(except) {
    return this.ctx.getWebSockets().filter((ws) => ws !== except && ws.readyState === 1 && ws.deserializeAttachment());
  }

  send(ws, obj) {
    try { ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch (e) { /* socket gone */ }
  }

  broadcast(obj, except) {
    const text = JSON.stringify(obj);
    for (const ws of this.players(except)) this.send(ws, text);
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const others = this.players();
    if (others.length >= CONFIG.MAX_PLAYERS) {
      server.accept(); // not hibernatable; only used to say "full"
      server.send(JSON.stringify({ t: 'full' }));
      server.close(1013, 'room full');
      return new Response(null, { status: 101, webSocket: client });
    }

    const used = new Set(others.map((ws) => ws.deserializeAttachment().slot));
    let slot = 0;
    while (used.has(slot)) slot++;

    const id = this.nextId++;
    await this.ctx.storage.put('nextId', this.nextId);
    await this.ctx.storage.deleteAlarm(); // someone is here: don't wipe the room

    this.ctx.acceptWebSocket(server);
    const att = { id, slot, name: '', hero: '', state: null };
    server.serializeAttachment(att);

    this.send(server, {
      t: 'welcome',
      id,
      slot,
      peers: others.map((ws) => {
        const a = ws.deserializeAttachment();
        return { id: a.id, slot: a.slot, name: a.name, hero: a.hero, state: a.state };
      }),
      world: Object.fromEntries(this.world),
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string') return; // text only
    const att = ws.deserializeAttachment();
    if (!att) return;

    // Rate limit (per wall-clock second).
    const sec = Math.floor(Date.now() / 1000);
    let r = this.rate.get(ws);
    if (!r || r.sec !== sec) { r = { sec, n: 0 }; this.rate.set(ws, r); }
    r.n++;
    if (r.n > CONFIG.KICK_MSGS_PER_SEC) { try { ws.close(1008, 'too many messages'); } catch (e) {} return; }
    if (r.n > CONFIG.MAX_MSGS_PER_SEC) return;

    if (message.length > CONFIG.MAX_MSG_BYTES) {
      this.send(ws, { t: 'err', why: 'too-big' });
      return;
    }

    let msg;
    try { msg = JSON.parse(message); } catch (e) { return; }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;

    switch (msg.t) {
      case 's': {
        msg.from = att.id;
        this.broadcast(msg, ws);
        // Keep latest state for welcome snapshots, but only touch the attachment every so often.
        const now = Date.now();
        if (now - (this.lastSave.get(ws) || 0) >= CONFIG.STATE_SAVE_MS && message.length <= CONFIG.MAX_STORED_STATE_BYTES) {
          this.lastSave.set(ws, now);
          const { t, from, ...state } = msg;
          att.state = state;
          ws.serializeAttachment(att);
        }
        return;
      }

      case 'ev': {
        if (typeof msg.k !== 'string') return;
        msg.from = att.id;
        if (msg.persist === true && typeof msg.key === 'string' && msg.key.length >= 1 && msg.key.length <= CONFIG.MAX_KEY_LEN) {
          const key = msg.key;
          if (msg.value === null || msg.value === undefined) {
            if (this.world.delete(key)) await this.ctx.storage.delete(WORLD_PREFIX + key);
          } else if (this.world.has(key) || this.world.size < CONFIG.MAX_WORLD_ENTRIES) {
            this.world.set(key, msg.value);
            await this.ctx.storage.put(WORLD_PREFIX + key, msg.value);
          } else {
            this.send(ws, { t: 'err', why: 'world-full' });
          }
        }
        this.broadcast(msg, ws);
        return;
      }

      case 'hello': {
        att.name = String(msg.name ?? '').slice(0, CONFIG.MAX_NAME_LEN);
        att.hero = String(msg.hero ?? '').slice(0, CONFIG.MAX_HERO_LEN);
        ws.serializeAttachment(att);
        this.broadcast({ t: 'join', id: att.id, slot: att.slot, name: att.name, hero: att.hero }, ws);
        return;
      }

      case 'ping':
        this.send(ws, { t: 'pong' });
        return;

      default:
        return; // unknown types are ignored
    }
  }

  async webSocketClose(ws, code, reason) {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye'); } catch (e) {}
    await this.leave(ws);
  }

  async webSocketError(ws) {
    await this.leave(ws);
  }

  async leave(ws) {
    const att = ws.deserializeAttachment();
    if (!att || att.left) return;
    att.left = true;
    try { ws.serializeAttachment(null); } catch (e) {}
    this.rate.delete(ws);
    this.lastSave.delete(ws);
    this.broadcast({ t: 'leave', id: att.id }, ws);
    if (this.players(ws).length === 0) {
      const secs = Number(this.env.EMPTY_ROOM_WIPE_SECONDS);
      const wait = secs > 0 ? secs * 1000 : CONFIG.EMPTY_ROOM_WIPE_MS;
      await this.ctx.storage.setAlarm(Date.now() + wait);
    }
  }

  // Runs ~30 min after the room became empty: reset it for the next class.
  async alarm() {
    if (this.players().length > 0) return;
    await this.ctx.storage.deleteAll();
    this.world.clear();
    this.nextId = 1;
  }
}
