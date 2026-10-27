# Brick Heroes co-op protocol

All messages are **JSON text** WebSocket frames. Every message has a `t` (type) field.
The server is generic: it does not interpret game data, it only relays and stores it.

## Connecting

```
GET  /                    -> 200 text "Brick Heroes co-op server OK"
GET  /room/<code>         -> WebSocket upgrade into room <code>
```

- `<code>`: 1-24 characters of `[a-z0-9-]`. Anything else -> HTTP 400 (the WebSocket fails to open).
- Not a WebSocket upgrade -> HTTP 426.
- If `ALLOWED_ORIGINS` is set on the server and the page's `Origin` is not in it -> HTTP 403.

```js
const ws = new WebSocket(CONFIG.COOP_SERVER + '/room/' + code);
```

## Server -> client

### `welcome` (first message after connecting)

```json
{
  "t": "welcome",
  "id": 7,
  "slot": 2,
  "peers": [
    { "id": 3, "slot": 0, "name": "Mia", "hero": "knight", "state": { "p": [1, 0, 4], "r": 1.2 } }
  ],
  "world": { "brick-12": { "done": true }, "gold-4": 1 }
}
```

- `id`: integer, unique within the room until the room is wiped (never reused while the room lives).
- `slot`: integer 0-11, the lowest free slot. Use it for the player colour. Freed when a player leaves.
- `peers`: everyone else already in the room. `name`/`hero` are `""` until that peer sends `hello`.
  `state` is that peer's latest `s` message (without `t`/`from`), or `null` if none yet.
  It is refreshed at most every 0.5 s, so treat it as a starting point; live `s` messages follow.
- `world`: the room's persisted world map (`key -> value`), see `ev` below. `{}` for a fresh room.

### `full`

```json
{ "t": "full" }
```

The room already has 12 players. The server closes the socket right after (close code 1013).

### `join`

```json
{ "t": "join", "id": 7, "slot": 2, "name": "Leo", "hero": "wizard" }
```

Sent to everyone else when a player sends `hello` (also when they send `hello` again to change
name/hero, so treat `join` for a known `id` as an update). A player who has connected but not
yet sent `hello` gets no `join`; their `s` messages may still arrive first, so create the remote
player on the first message from an unknown `id`.

### `s` (relayed state)

```json
{ "t": "s", "from": 7, "...": "whatever the sender put in" }
```

### `ev` (relayed event)

```json
{ "t": "ev", "from": 7, "k": "smash", "...": "whatever the sender put in" }
```

### `leave`

```json
{ "t": "leave", "id": 7 }
```

### `pong`

```json
{ "t": "pong" }
```

### `err`

```json
{ "t": "err", "why": "too-big" }      // message was > 2048 characters, dropped
{ "t": "err", "why": "world-full" }   // persist ignored: room already has 500 world keys (still relayed)
```

## Client -> server

### `hello`

```json
{ "t": "hello", "name": "Leo", "hero": "wizard" }
```

Send right after `welcome`. `name` is cut to 24 characters, `hero` to 32 (both stored as strings).
Server broadcasts `join` to the others. Can be sent again to update.

### `s` - frequent player state (~10-15 per second)

```json
{ "t": "s", "p": [1.2, 0, 4.5], "r": 1.57, "a": "run" }
```

Any fields you like (`t` and `from` are reserved). The server adds `from` and sends it to
**everyone except the sender** (no echo). The latest one (if <= 1200 chars) is kept for
`welcome.peers[].state`. Not stored anywhere else.

### `ev` - world event

```json
{ "t": "ev", "k": "emote", "e": "wave" }
{ "t": "ev", "k": "build", "persist": true, "key": "brick-12", "value": { "done": true } }
{ "t": "ev", "k": "unbuild", "persist": true, "key": "brick-12", "value": null }
```

- `k` (string) is required; messages without it are ignored. Other fields are free.
- Relayed to everyone except the sender, with `from` added (the whole message, including
  `persist`/`key`/`value`).
- If `persist: true` and `key` is a string of 1-64 characters:
  - `value` not null -> server stores `world[key] = value` (survives until the room is wiped).
  - `value` null or missing -> server deletes `world[key]`.
  - Max 500 keys per room; new keys beyond that are not stored (`err world-full`), existing keys can still be updated.
- Late joiners receive the map in `welcome.world`. Design values so that "last write wins" is fine.

### `ping`

```json
{ "t": "ping" }
```

Answered with `{"t":"pong"}`. The exact text `{"t":"ping"}` is answered without waking the room
(cheapest; good for keep-alive every ~20-30 s).

## Limits and behaviour

| What | Limit |
| --- | --- |
| Players per room | 12 (slots 0-11) |
| Message size | 2048 characters (bigger -> dropped + `err too-big`) |
| Messages per second per player | 40 (extra are silently dropped); over 200/s the socket is closed with code 1008 |
| World keys per room | 500, key length 1-64 |
| Room wipe | 30 minutes after the last player leaves: world cleared, ids restart at 1. Cancelled if someone joins. |
| Binary frames, invalid JSON, unknown `t` | ignored |

The server never sends your own `s`/`ev`/`join` back to you. On disconnect (any reason), others
get `leave`. Reconnecting gives a new `id` (and usually the same slot if it is still free).

## Minimal client sketch

```js
const ws = new WebSocket(CONFIG.COOP_SERVER + '/room/' + code);
const others = new Map(); // id -> remote player
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.t === 'welcome') {
    myId = m.id; mySlot = m.slot;
    ws.send(JSON.stringify({ t: 'hello', name, hero }));
    m.peers.forEach(addOrUpdatePeer);
    applyWorld(m.world);
  } else if (m.t === 'join') addOrUpdatePeer(m);
  else if (m.t === 's') updatePeerState(m.from, m);
  else if (m.t === 'ev') handleEvent(m);
  else if (m.t === 'leave') removePeer(m.id);
  else if (m.t === 'full') showRoomFull();
};
setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ t: 's', p, r, a })), 80);
```
