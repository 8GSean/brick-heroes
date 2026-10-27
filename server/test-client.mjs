// Brick Heroes co-op server test client (Node 22+, uses the global WebSocket).
//
//   node test-client.mjs [url] [players]
//   node test-client.mjs ws://localhost:8787/room/test 4
//   node test-client.mjs wss://brick-heroes-coop.<you>.workers.dev/room/test
//
// Optional: WIPE_TEST=1 also checks the empty-room wipe (start the server with
// EMPTY_ROOM_WIPE_SECONDS=3, e.g. `npx wrangler dev --var EMPTY_ROOM_WIPE_SECONDS:3`).

const URL_ARG = process.argv[2] || 'ws://localhost:8787/room/test';
const N = Math.max(2, Math.min(11, Number(process.argv[3]) || 4));
const RUN = Math.random().toString(36).slice(2, 8);
const base = URL_ARG.replace(/\/room\/[^/]*\/?$/, '');

let failed = 0;
function check(ok, label, extra) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`);
  if (!ok) failed++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A small wrapper that records every message and lets us wait for one.
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const c = { ws, msgs: [], waiters: [], closed: false };
    c.send = (o) => ws.send(typeof o === 'string' ? o : JSON.stringify(o));
    c.wait = (pred, ms = 3000) => new Promise((res, rej) => {
      const hit = c.msgs.find(pred);
      if (hit) return res(hit);
      const w = { pred, res };
      c.waiters.push(w);
      setTimeout(() => { c.waiters = c.waiters.filter((x) => x !== w); rej(new Error('timeout')); }, ms);
    });
    c.got = (pred) => c.msgs.filter(pred);
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      c.msgs.push(m);
      for (const w of [...c.waiters]) if (w.pred(m)) { c.waiters = c.waiters.filter((x) => x !== w); w.res(m); }
    });
    ws.addEventListener('open', () => resolve(c));
    ws.addEventListener('close', () => { c.closed = true; });
    ws.addEventListener('error', () => reject(new Error('connect failed: ' + url)));
  });
}
const tryWait = async (c, pred, ms) => { try { return await c.wait(pred, ms); } catch { return null; } };

async function main() {
  console.log(`Testing ${URL_ARG} with ${N} players (run ${RUN})\n`);

  // 0. Health check
  try {
    const httpBase = base.replace(/^ws/, 'http');
    const res = await fetch(httpBase + '/');
    const text = await res.text();
    check(res.ok && text.includes('Brick Heroes co-op server OK'), 'GET / says OK', text);
  } catch (e) { check(false, 'GET / says OK', String(e)); }

  // 1. Bad room code is rejected
  let badRejected = false;
  try { const b = await connect(base + '/room/BAD_Code!'); b.ws.close(); } catch { badRejected = true; }
  check(badRejected, 'bad room code rejected');

  // 2. Players join one by one
  const room = URL_ARG;
  const cs = [];
  for (let i = 0; i < N; i++) {
    const c = await connect(room);
    const w = await tryWait(c, (m) => m.t === 'welcome');
    check(!!w && w.id !== undefined && Number.isInteger(w.slot) && w.slot >= 0 && w.slot < 12 && Array.isArray(w.peers) && typeof w.world === 'object',
      `player ${i} gets welcome (id=${w && w.id}, slot=${w && w.slot})`, w);
    check(!!w && w.peers.length >= i, `player ${i} welcome lists ${i} earlier peer(s)`, w && w.peers);
    c.id = w && w.id; c.slot = w && w.slot;
    c.send({ t: 'hello', name: 'Kid' + i, hero: 'knight' });
    for (const prev of cs) {
      const j = await tryWait(prev, (m) => m.t === 'join' && m.id === c.id);
      check(!!j && j.name === 'Kid' + i && j.hero === 'knight' && j.slot === c.slot, `player ${prev.idx} sees join of player ${i}`, j);
    }
    c.idx = i;
    cs.push(c);
  }
  const slots = new Set(cs.map((c) => c.slot));
  check(slots.size === cs.length, 'all slots are different', [...slots]);

  // 3. State relay (no echo)
  const [a, ...rest] = cs;
  a.send({ t: 's', p: [1, 2, 3], r: 0.5, a: 'run', run: RUN });
  for (const c of rest) {
    const s = await tryWait(c, (m) => m.t === 's' && m.run === RUN);
    check(!!s && s.from === a.id && s.p[1] === 2 && s.a === 'run', `player ${c.idx} gets state from player 0`, s);
  }
  await sleep(300);
  check(a.got((m) => m.t === 's').length === 0, 'sender does not get its own state back');

  // 4. Events: plain + persisted
  const key = 'brick-' + RUN;
  a.send({ t: 'ev', k: 'emote', e: 'wave', run: RUN });
  a.send({ t: 'ev', k: 'build', persist: true, key, value: { done: true, by: 'Kid0' } });
  for (const c of rest) {
    const e1 = await tryWait(c, (m) => m.t === 'ev' && m.k === 'emote' && m.run === RUN);
    const e2 = await tryWait(c, (m) => m.t === 'ev' && m.key === key);
    check(!!e1 && e1.from === a.id && !!e2 && e2.value.done === true, `player ${c.idx} gets events from player 0`, [e1, e2]);
  }

  // 5. Ping (exact text -> auto response) and ping with extra spaces (handled in code)
  a.send('{"t":"ping"}');
  check(!!(await tryWait(a, (m) => m.t === 'pong')), 'ping -> pong');
  a.msgs = a.msgs.filter((m) => m.t !== 'pong');
  a.send({ t: 'ping', n: 1 });
  check(!!(await tryWait(a, (m) => m.t === 'pong')), 'ping (non-exact) -> pong');

  // 6. Oversize message dropped with err
  a.send({ t: 's', junk: 'x'.repeat(3000), run: RUN + 'big' });
  const big = await tryWait(a, (m) => m.t === 'err' && m.why === 'too-big');
  await sleep(200);
  check(!!big && rest.every((c) => c.got((m) => m.run === RUN + 'big').length === 0), 'oversize message dropped (err too-big)');

  // 7. Late joiner sees persisted world + peers with names and last state
  const late = await connect(room);
  const lw = await tryWait(late, (m) => m.t === 'welcome');
  check(!!lw && lw.world && lw.world[key] && lw.world[key].done === true, 'late joiner gets persisted world entry', lw && lw.world);
  const ap = lw && lw.peers.find((p) => p.id === a.id);
  check(!!ap && ap.name === 'Kid0' && ap.hero === 'knight' && ap.state && ap.state.a === 'run', 'late joiner sees player 0 name/hero/last state', ap);
  check(!!lw && !lw.world['never-' + RUN], 'non-persisted events are not in world');

  // 8. Delete a world key with value:null
  a.send({ t: 'ev', k: 'unbuild', persist: true, key, value: null });
  await tryWait(late, (m) => m.t === 'ev' && m.k === 'unbuild');
  const late2 = await connect(room);
  const lw2 = await tryWait(late2, (m) => m.t === 'welcome');
  check(!!lw2 && !(key in lw2.world), 'persist with value:null removes the key', lw2 && lw2.world);
  late2.ws.close();

  // 9. Rate limit: 120 messages in a burst; others should get at most ~40-80
  const b = cs[1];
  for (let i = 0; i < 120; i++) b.send({ t: 's', burst: RUN, i });
  await sleep(800);
  const gotBurst = a.got((m) => m.burst === RUN).length;
  check(gotBurst > 0 && gotBurst < 120, `rate limit drops a flood (${gotBurst}/120 relayed)`);
  check(!b.closed, 'flooding client (below kick level) stays connected');

  // 10. Leave
  const leaverId = a.id;
  a.ws.close();
  for (const c of [...rest, late]) {
    const l = await tryWait(c, (m) => m.t === 'leave' && m.id === leaverId);
    check(!!l, `player ${c.idx ?? 'late'} sees leave of player 0`);
  }
  // Freed slot is reused
  const again = await connect(room);
  const aw = await tryWait(again, (m) => m.t === 'welcome');
  check(!!aw && aw.slot === a.slot && aw.id !== leaverId, `rejoin gets freed slot ${a.slot} and a new id`, aw && { id: aw.id, slot: aw.slot });
  again.ws.close();

  for (const c of [...rest, late]) c.ws.close();

  // 11. Full room: 12 fit, 13th gets {t:"full"}
  const fullRoom = base + '/room/full-' + RUN;
  const many = [];
  for (let i = 0; i < 12; i++) { const c = await connect(fullRoom); await tryWait(c, (m) => m.t === 'welcome'); many.push(c); }
  check(new Set(many.map((c) => c.msgs[0] && c.msgs[0].slot)).size === 12, '12 players get slots 0..11');
  const extra = await connect(fullRoom);
  const f = await tryWait(extra, (m) => m.t === 'full');
  await sleep(300);
  check(!!f && extra.closed, '13th player gets {t:"full"} and is closed');
  for (const c of many) c.ws.close();

  // 12. Optional: world wipe after the room is empty
  if (process.env.WIPE_TEST) {
    const wipeRoom = base + '/room/wipe-' + RUN;
    const w1 = await connect(wipeRoom);
    await tryWait(w1, (m) => m.t === 'welcome');
    w1.send({ t: 'ev', k: 'x', persist: true, key: 'k', value: 1 });
    await sleep(300);
    w1.ws.close();
    const secs = Number(process.env.WIPE_TEST) > 1 ? Number(process.env.WIPE_TEST) : 3;
    await sleep((secs + 3) * 1000);
    const w2 = await connect(wipeRoom);
    const ww = await tryWait(w2, (m) => m.t === 'welcome');
    check(!!ww && Object.keys(ww.world).length === 0 && ww.id === 1, 'empty room is wiped after the alarm', ww);
    w2.ws.close();

    // Rejoin before the alarm cancels the wipe
    const r1 = await connect(wipeRoom);
    await tryWait(r1, (m) => m.t === 'welcome');
    r1.send({ t: 'ev', k: 'x', persist: true, key: 'k', value: 2 });
    await sleep(300);
    r1.ws.close();
    await sleep(1000);
    const r2 = await connect(wipeRoom); // cancels the alarm
    await tryWait(r2, (m) => m.t === 'welcome');
    await sleep((secs + 2) * 1000);
    const r3 = await connect(wipeRoom);
    const rw = await tryWait(r3, (m) => m.t === 'welcome');
    check(!!rw && rw.world.k === 2, 'rejoining cancels the wipe', rw && rw.world);
    r2.ws.close(); r3.ws.close();
  }

  await sleep(200);
  console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAIL'}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.log('FAIL  crashed: ' + e.message); process.exit(1); });
