# 1. Coordinator role with a durable epoch

Date: 2026-09-12
Status: accepted

## Context

The room needs a coordination role for the few operations that require a single decider
(admitting a peer, naming a checkpoint), and the role must survive the peer that created the
room. The idea doc proposed "ownership" with versioned epochs; earlier map notes proposed a
purely presence-derived coordinator that is never persisted.

Those two designs conflict on whether anything durable backs the role. A purely ephemeral role
cannot stop a returning peer from reasserting stale authority, because there is nothing for
its claim to be stale against. A role persisted in the control plane would let an absent peer
hold authority it can no longer exercise, and would put authority on the server, which #4
forbids.

## Decision

There is no owner. The role is the **coordinator**, stored as a register in the room's shared
`Y.Doc`: `{ epoch, clientID }`. Handoffs increment `epoch`. On any reconnect or re-merge the
winner is `max(epoch)`, ties broken by `max(clientID)`. Presence gates eligibility: only a
present peer can hold the role, and the role is vacant when no peer is present.

**The epoch is durable; the holder is presence-derived.** The database stores neither. The UI
renders the epoch as a round: `COORD · R3`.

## Consequences

- A returning peer with a stale epoch yields automatically. Act 4 needs no special case.
- Concurrent handoffs in two partitions converge deterministically by `(epoch, clientID)`.
- The control plane stays authority-free, matching the schema in #4.
- Any UI needing authority state reads it from the room's CRDT, not the API.
- "Owner" is retired from the product vocabulary; see `CONTEXT.md`.

## Alternatives considered

- **Purely presence-derived, never persisted** — rejected: cannot distinguish a stale
  returning peer from a fresh one.
- **Authority persisted in Postgres** — rejected: puts authority on the control plane and lets
  an absent peer hold it.
- **Wall-clock "last disconnected wins"** — rejected: peers share no trustworthy clock, and
  offline edits carry no reliable time.
