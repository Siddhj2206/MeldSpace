# Review 1 brief

What we are building, the problem it solves, and the answers to keep ready.

## In one line

A collaborative room that lives on the devices in it: peers hold replicas, exchange
changes directly, keep working while disconnected, and converge when they reconnect.
The server only helps them find each other and know who is in the room.

## The problem

Centralised collaboration puts the shared workspace on a server, so availability and
authority both depend on that server and whoever operates it. When the network drops the
workspace goes read-only or diverges opaquely; when the creator leaves, coordination is
stuck. MeldSpace moves the shared object, and the authority over it, onto the peers.

The systems claim is the one that matters for this track: a room that stays a coherent
shared object across disconnection, device failure, and a change of coordinator.

## What we built versus what we assembled

Built: the room model, the coordination protocol, the local-first persistence wiring, the
shell.

Assembled: Yjs (merge), y-webrtc (transport), y-indexeddb (durability), CodeMirror and
Excalidraw (surfaces).

Say the split out loud. The contribution is the coordination layer, not the CRDT.

## Offline: what is true today

- Offline **editing** works. The `Y.Doc` is local and `IndexeddbPersistence` writes it to
  IndexedDB; the editor keeps accepting input with no network.
- Offline **reload** does not. There is no service worker, so a refresh while disconnected
  cannot fetch the app shell.
- Reconnect **convergence** is expected from Yjs but unverified; #5 owns it.

So: offline editing, yes; offline reload, not yet; convergence, next.

## Coordination: how the role resolves

Content merges automatically in Yjs, so there is no runtime "clean merge" decision.
Authority needs an explicit, deterministic rule:

- The coordinator is a register in the shared `Y.Doc`: `{ epoch, clientID }`.
- Handoff increments the epoch.
- On any reconnect or re-merge, the winner is `max(epoch)`, ties broken by `max(clientID)`.
- Presence gates eligibility; the epoch decides which claim is current.

A returning old owner carries a stale epoch and loses, which is exactly the Act 4
behaviour. "Who disconnected last" cannot do this, because peers have no shared clock and
no shared record of disconnect order.

One split still to settle: the map says the coordinator is presence-derived and never
persisted, but the stale-owner rule needs a durable epoch. Proposed resolution — the epoch
is durable CRDT state, while the current holder is presence-derived.

## Why not just run a server

Self-hosting and privacy are about *who holds the data*, and a self-hosted central server
delivers that too. The P2P-specific benefits are availability under partition, no single
point of failure or control, survival of the creator, locality, and operator cost.

The defensible claim: **our promise is that the room survives the network, the devices, and
the person who made it. A central server makes that promise impossible by construction,
because the one thing the room depends on is the one thing that can go down.**

Have the counter-case ready: a central server is simpler, easier to secure and back up,
and gives server-side search and compute. Decentralisation is a trade, not a universal win.

## Relay and deployment: P2P-first, server-optional

The default path is peer-to-peer over WebRTC with our self-hosted signalling server.
Servers are optional, substitutable, and content-blind or replica-only.

Three things, kept separate:

- **Signalling** (built, #3). Brokers introductions; never sees content.
- **TURN relay** (#19). The ICE fallback for symmetric NAT and corporate firewalls.
  Self-hosted coturn, env-configured, off by default. It forwards encrypted DTLS it cannot
  read, so it is content-blind and ephemeral. This is what makes "works over the internet"
  true rather than "works on one LAN".
- **Server-as-peer** (documented, not built). An always-on `y-websocket` node holding a
  replica, so the room is reachable with no peer online and late joiners get state
  immediately. The thesis survives only if it is framed as one substitutable replica among
  peers, never a required source of truth.

Operator story: Tailscale (or Headscale, self-hosted) is how an organisation reaches its own
always-on node from its devices. It is not a consumer onboarding path, because every
participant would need to install Tailscale and join the tailnet; join-by-code stays
browser-only.

Trust boundary to state precisely: the relay sees **metadata** (who connected to whom, when,
volume), never content. "The relay learns nothing" is false; "the relay never sees content"
is defensible.

Invariant to hold everywhere: **the shared object must never require a central replica.**

## Questions to expect

1. What did you build versus assemble? — the coordination layer and the room model; the
   rest is proven primitives.
2. What is actually in Git? — content-addressed checkpoints, with isomorphic-git export for
   the graph. Not a Git graph today.
3. Show me offline. — editing yes; reload needs a service worker; convergence is #5.
4. Who is coordinator when two peers both think they are? — the epoch rule above.
5. Why not just a server? — the promise requires no single point that must be up.

## Known gaps

- Offline reload (service worker) is not built.
- The board spike (#14) has not run; the fallback is a Yjs-native board.
- Owner versus coordinator vocabulary is not reconciled in one place; `CONTEXT.md` and
  `docs/adr/` are not written yet.
- The signalling green dot reflects signalling, not peer count.
