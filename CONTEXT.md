# MeldSpace — context

A peer-to-peer collaborative room where the room itself is the shared object. Peers hold
replicas, exchange changes directly, keep working while disconnected, and converge when they
reconnect. A small hosted control plane handles identity, membership and signalling; it never
holds room content and never holds authority.

## The problem

Centralised collaboration puts the shared workspace on a server, so availability and
authority both depend on that server and its operator. MeldSpace moves both onto the peers.
The systems claim is the whole point: **a room stays a coherent shared object across
disconnection, device failure, and a change of coordinator.**

## Primitives

| Term | Meaning | Durability |
| --- | --- | --- |
| **Peer / device** | One replica of the room. Stable `deviceId`. | Identity durable; session is not. |
| **Room** | The distributed collaborative object. | Durable, replicated across peers. |
| **Artifact** | Durable content: document, board, image, comment. | Durable. |
| **Surface** | A way of viewing an artifact. Never the data model. | — |
| **Operation** | A meaningful change eligible for a checkpoint. | Durable once checkpointed. |
| **Checkpoint** | A content-addressed snapshot of meaningful room state. | Durable. |
| **Presence** | Who is here, doing what, right now. | Ephemeral. |
| **Coordinator** | The peer currently holding the coordination role. | Presence-derived. |
| **Epoch** | Monotonic counter of coordination handoffs. | Durable, in the room's CRDT. |

## Authority

There is no owner. Content authority is equal across peers; no peer owns the room's data.

The **coordinator** is a narrow coordination role, not an administrator. It sequences the few
things that need a single decider (admitting a peer, naming a checkpoint). It can never
override content.

The role resolves deterministically:

- The coordinator is a register in the shared `Y.Doc`: `{ epoch, clientID }`.
- A handoff increments `epoch`.
- On any reconnect or re-merge, the winner is `max(epoch)`, ties broken by `max(clientID)`.
- Presence gates eligibility: only a present peer can hold the role. When no peer is present
  the role is vacant; the epoch persists.
- A returning peer carrying a stale epoch loses. This is the Act 4 behaviour.

The split to hold: **the epoch is durable CRDT state; the holder is presence-derived.** The
database stores neither. (#4 enforces no authority columns.)

The UI renders the epoch as a round: `COORD · R3` means epoch 3.

## Durable versus ephemeral

Durable (room CRDT + checkpoint log): document text, board state, artifacts, comments, the
coordinator epoch.

Ephemeral (never persisted, never in history): presence, cursors, selection, connection
status, the current coordinator holder.

Control plane (Postgres): identity, membership, invites, room metadata. Never content; never
authority.

## Vocabulary for offline

- **Local** — your device's replica. Always editable.
- **Queued** — local changes not yet shared.
- **Converged** — all present peers hold the same state. Use this, not "synced."
- **While you were away** — the diff since your last checkpoint.
- **Checkpoint** — a durable snapshot, not a Git commit.

## Terms we don't use

- **Owner / admin** — no peer owns the data, and the coordinator is not an administrator.
- **Synced** — say converged.
- **Git commit** as a user-facing concept — say checkpoint. Git is an export format.
- **Server / source of truth** — the control plane is bootstrap only; the room never requires
  a central replica.

## Invariants

1. The shared object must never require a central replica.
2. No authority lives in the database.
3. No room content enters the control plane.
4. Presence never enters history.
