# Self-hosted TURN relay (#19)

Peers on different networks need an ICE fallback: a STUN lookup usually
suffices, but symmetric NATs and corporate firewalls need a TURN relay. The
relay forwards **encrypted DTLS packets only** — it sees connection metadata
(who talks to whom, when, how much), never room content. It does not create a
replica, so the invariant holds: the shared object never _requires_ a central
replica; the relay is used only when a direct pair fails, and ICE always
prefers direct.

## Client wiring (done in code)

`apps/web/src/room/room-provider.tsx` builds an `iceServers` list from env and
passes it through `WebrtcProvider`'s `peerOpts`, which y-webrtc spreads into
simple-peer. Both the room provider and the blob provider get it. With nothing
set, behaviour is exactly the LAN path.

```bash
# apps/web/.env
VITE_STUN_URL=stun:stun.example.com:3478        # optional
VITE_TURN_URL=turn:turn.example.com:3478        # or turns:…:5349
VITE_TURN_USERNAME=<time-limited user>
VITE_TURN_CREDENTIAL=<time-limited credential>
# optional: signalling on a reachable host instead of :4444 inference
VITE_SIGNALING_URL=wss://signal.example.com
```

## coturn

```bash
STATIC_SECRET=$(openssl rand -hex 32)

docker run -d --name coturn --network host \
  coturn/coturn \
  turnserver \
    --listening-port=3478 \
    --tls-listening-port=5349 \
    --realm=meldspace \
    --use-auth-secret \
    --static-auth-secret=$STATIC_SECRET \
    --min-port=49152 --max-port=65535 \
    --no-multicast-peers --no-cli
```

Ports: `3478 udp+tcp` (STUN/TURN), `5349 tcp` (TURNS, needs `--cert`/`--pkey`),
`49152-65535/udp` (relay range).

`--use-auth-secret` means no static password ships in the repo: credentials
are derived per expiry window on any host that knows the secret — e.g. a
`/turn-credentials` helper on the control plane, or by hand for the demo:

```bash
# username = <expiry unix ts>:<label>; credential = base64(hmac-sha1(secret, username))
USER="$(($(date +%s)+86400)):demo"
PASS=$(printf '%s' "$USER" | openssl dgst -sha1 -hmac "$STATIC_SECRET" -binary | base64)
```

## Verify

- `chrome://webrtc-internals` on a joined peer: the selected candidate pair
  should be `host`/`srflx` on a LAN, `relay` only when direct fails.
- trickle-ICE (https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/)
  against `turn:host:3478` must return a `relay` candidate.
- TURN unset + two machines on one LAN = the R1 demo, unchanged.
