# MeldSpace — P2P Collaborative Room

## Name

**MeldSpace**

## One-line idea

A peer-to-peer collaborative room where the **room itself is the shared object**: people can join from different devices, work together in realtime, continue working while disconnected, and reconnect without losing work. The room survives individual peers, with ownership/coordination transferable between remaining peers.

## Track

**Track 2 — Systems & Infrastructure**  
**Subtrack — Decentralization & Protocols**

The project is fundamentally about peer-to-peer replication, synchronization, disconnect tolerance, and decentralized coordination. The UI is the proof that the underlying system works.

---

# Product architecture

MeldSpace has a small hosted control plane, while the actual room data remains distributed across participating peers.

```text
                 Hosted control plane
        ┌────────────────────────────────┐
        │ Auth                           │
        │ Room metadata / membership     │
        │ WebRTC signaling / rendezvous  │
        └───────────────┬────────────────┘
                        │ bootstrap
                        ▼
                  P2P collaboration
              ┌─────────┼─────────┐
              │         │         │
            Alice      Bob     Charlie
              │         │         │
          local room local room local room
              │         │         │
             Git/CRDT/state/artifacts
```

Authentication identifies the human/account. Each participating device also has a peer/device identity used by the room protocol. The hosted service should not be the source of truth for canvas state, documents, Git history, or room files.

The initial implementation is TypeScript-first. Use the simplest P2P transport that fits the browser-first product; WebRTC is the default candidate. Tauri remains an optional future/native surface rather than a requirement.

---

# The core idea

Today collaboration usually assumes a central server owns the shared workspace:

```text
Alice ─┐
Bob   ─┼── Server ── Shared project
Carol ─┘
```

Our model is:

```text
Alice ───── Bob
   \         /
    \       /
      Charlie

        ROOM
```

Every participant holds a local replica of the room. Peers exchange changes directly whenever they can. The room remains usable when a peer disappears or a network connection drops.

The central product abstraction is **not a whiteboard, file drive, or chat app**. It is a **collaborative room** that can contain several kinds of shared artifacts and surfaces.

---

# What is inside a room?

The room is a container for a small set of extensible collaborative objects.

```text
Room
├── Canvas
├── Documents
├── Files / Assets
├── Comments / Annotations
├── Presence
└── History
```

The first implementation should use a small number of surfaces and keep the internal architecture extensible so additional surfaces can be added later without changing the room/network model.

## 1. Shared canvas

Use **tldraw** as the first major collaborative surface.

The canvas is a live shared workspace where users can:

- draw and edit objects
- see other users' cursors/presence
- arrange objects
- annotate ideas
- place references to other room artifacts

The canvas is not the whole product. It is one surface inside the room.

## 2. Shared text editor

The room can contain editable text documents.

Examples:

```text
README.md
meeting-notes.md
ideas.txt
```

Multiple people can edit at the same time and continue editing locally when disconnected.

For the MVP, a simple text document is enough. More advanced language-aware editing can be added later.

## 3. Images and other files

Files are first-class room artifacts.

Examples:

```text
architecture.png
photo.jpg
data.csv
prototype.zip
```

The canvas can reference or display these artifacts. For example, an image can be dragged into the canvas and becomes a persistent room object pointing to the underlying file.

Large file contents should be transferred separately from the small collaborative metadata/state that references them.

## 4. File viewers / artifact surfaces

A room can have lightweight viewers for supported artifact types:

- image viewer
- text/Markdown viewer
- PDF viewer
- code/text viewer
- eventually audio/video or other formats

These viewers are **surfaces over the same room artifacts**, not independent storage systems.

## 5. Comments and annotations

Users can attach comments to room objects or canvas elements.

Examples:

```text
Comment on image:
"Use the second version."

Comment on canvas object:
"Move this node closer to the database."
```

Comments are durable shared state and therefore participate in history.

## 6. Presence

Presence is intentionally ephemeral.

The room can show:

```text
Alice     ● online
Bob       ● online
Charlie   ○ offline
```

It can also show live cursors/selections where supported.

Presence does **not** become part of durable history.

## 7. History

The room has a unified history of meaningful changes.

Git is used as the durable history/state layer rather than inventing a custom history database.

A history entry might look like:

```text
10:42  Alice    Added authentication flow
10:31  Bob      Added architecture.png
10:12  Alice    Created initial design
```

The user should be able to inspect an earlier checkpoint and eventually rewind the room to that state.

---

# The most important behavior: disconnected collaboration

This is the reason the product exists.

Example:

```text
Alice  ←→  Bob  ←→  Charlie
```

Alice loses connectivity completely.

```text
Alice        Bob  ←→  Charlie
  X
```

Alice continues working on her local replica.

Bob and Charlie continue working and synchronizing with each other.

Alice later reconnects.

```text
Alice  ←→  Bob  ←→  Charlie
```

Her missing changes are reconciled into the room.

The system should not require the user to manually export/import the project or restore a backup.

---

# Ownership and failure recovery

The room has a notion of **ownership/coordinator**.

Ownership is a coordination role, not ownership of the room's data.

All peers retain their own replicas. The current owner can coordinate operations that need a single authority, such as room membership or other room-level coordination.

Example:

```text
Alice   ← Owner
Bob
Charlie
```

Alice disappears.

Bob and Charlie continue synchronizing:

```text
Bob   ←→   Charlie
```

They can transfer ownership:

```text
Owner: Bob
Epoch: N+1
```

When Alice returns, she catches up to the newer room state and ownership epoch.

Ownership transfer must be versioned so an old/disconnected peer cannot accidentally reassert stale authority when it reconnects.

---

# Live collaboration vs durable history

These are different layers.

## Live state

Used for high-frequency collaborative interaction:

```text
cursor movement
shape dragging
typing
selection
presence
```

These updates should feel realtime and should not create a Git commit for every intermediate action.

## Durable state

Used for meaningful persistent changes:

```text
finished canvas edit
saved document state
new artifact
comment
room configuration
```

These changes become part of the durable room state and can be checkpointed into Git.

Conceptually:

```text
Live interaction
      ↓
collaborative state
      ↓
meaningful checkpoint
      ↓
Git commit
```

---

# Git's role

Git should provide the mature primitives we do not need to reinvent:

- immutable content-addressed objects
- snapshots
- commits
- branches
- merge history
- references
- distributed copies of history

The product should not expose Git's internals everywhere.

Users should see concepts such as:

- room history
- checkpoint
- offline work
- changes while you were away
- rewind
- conflict

Git remains the underlying history/state mechanism.

A room can conceptually evolve like:

```text
        C0
       /  \
      /    \
   Alice   Bob
     A       B
      \     /
       \   /
        MERGE
          |
         C1
```

Different artifact types may need different merge strategies.

---

# Extensible surface architecture

The room should be designed around an abstraction of a **surface/artifact type**, rather than hard-coding tldraw into the room.

Conceptually:

```text
Room
 │
 ├── Surface: Canvas
 │     └── tldraw
 │
 ├── Surface: Text
 │     └── editor
 │
 ├── Surface: Image
 │     └── viewer
 │
 └── Surface: FutureThing
       └── plugin / adapter
```

Each surface should describe:

```text
identity
state representation
live synchronization needs
durable representation
render/editor UI
serialization / persistence
merge strategy
```

The room/network layer should not need to know whether the surface is a canvas, text editor, image viewer, or something added later.

This lets the team build one solid room protocol and add capabilities incrementally.

---

# Artifacts vs surfaces

A useful separation is:

### Artifact

The underlying persistent thing.

Examples:

- text document
- image file
- dataset
- tldraw document

### Surface

A way of interacting with or viewing an artifact.

Examples:

- text editor
- image viewer
- canvas
- previewer

One artifact can eventually have multiple surfaces.

For example:

```text
architecture.png
     │
     ├── image viewer
     └── canvas image object
```

This avoids making the UI itself the data model.

---

# P2P networking

The networking layer is deliberately replaceable.

We should choose the simplest transport that fits the clients and demo rather than making the language or transport a product requirement.

Potential options include:

- WebRTC for the browser-first MVP and direct peer collaboration
- Tauri as an optional desktop/native shell if browser capabilities become a blocker
- other TypeScript-friendly P2P transports if they better fit a specific primitive

We are intentionally **not committing the product to iroh or Rust**. The room/collaboration model must remain independent of the transport.

The application-level room model should stay independent of this choice.

Conceptually:

```text
Room / collaboration model
          │
     sync protocol
          │
   transport adapter
      /     |      \
 WebRTC   iroh   other
```

---

# What should be first-class?

The room needs to understand a few things regardless of transport or UI:

### Peer

A participant/device replica of the room.

### Room

The collaborative distributed object.

### Artifact

Persistent content/state belonging to the room.

### Operation/change

A meaningful modification that can become durable history.

### Ownership

Current coordination authority plus an ownership epoch.

### Checkpoint

A durable snapshot in room history.

Everything else should be built around these primitives.

---

# Feature model

The product should feel like one room, not a collection of separate apps.

## Core room surfaces

### Shared canvas

`tldraw` is the primary collaborative surface. Users can draw, move objects, see presence/cursors, and place references to room artifacts.

### Shared text

A simple collaborative text/Markdown editor for notes and lightweight documents. This should use an existing TypeScript editor and synchronization primitive rather than a custom editor or CRDT.

### Files / assets

Files are first-class artifacts. Large bytes are transferred independently from small room metadata. The canvas can contain a reference to an artifact, such as an image dropped onto the canvas.

### Artifact viewers

Lightweight viewers can open the same underlying artifact without creating a second copy of the data. Initial candidates are image and text/Markdown viewers. PDF or richer media support can wait.

### Comments / annotations

Comments can attach to room objects or canvas elements and become durable shared state.

## Room history

Git is the durable memory of the room. Live collaborative state should not produce a Git commit for every keystroke, cursor move, or shape movement. Meaningful checkpoints create Git history that users experience as room history, rewind, and “what changed while I was away?”.

## Ownership

Ownership is a transferable coordination role, not ownership of the data. The owner is identified together with an ownership epoch. Remaining peers can transfer ownership when the current owner disappears; stale peers cannot reassert authority after reconnecting.

## What the room should feel like

The user should be able to create a room, invite people, put multiple artifacts/surfaces into it, collaborate live, disconnect, keep working locally, reconnect, and inspect the room’s history. The product should make it feel like **the room persists independently of any one device or person**.

---

# 36-hour MVP

The project succeeds if this exact story works reliably.

```text
1. Alice creates a room.
2. Bob joins using QR/code.
3. Both see the same tldraw canvas.
4. Both edit simultaneously.
5. Alice disconnects completely.
6. Bob and another peer continue collaborating.
7. Alice keeps editing offline.
8. Alice reconnects and converges with the other peers.
9. The original owner can disappear.
10. The remaining peers transfer ownership.
11. The old owner returns and catches up.
12. Meaningful changes appear in Git-backed history.
13. A previous checkpoint can be inspected.
```

That is the core product.

---

# Feature priority

## Core

- room creation
- room join via QR/code
- peer discovery/connection
- local room replica
- tldraw collaboration
- offline editing
- reconnect and reconciliation
- three-peer synchronization
- ownership transfer
- Git-backed checkpoints/history

## Features

- shared text editor
- image/file upload
- image viewer
- drag artifacts onto canvas
- comments/annotations
- history UI
- basic rewind/restore
- peer presence

## Stretch

- automatic peer discovery on LAN
- peer-assisted artifact retrieval
- room recovery after all clients restart
- richer Git graph
- semantic merge UI for conflicting documents
- additional artifact/surface types
- mobile-first client
- more sophisticated permissions

---

# Explicitly out of scope for the hackathon

- custom CRDT implementation
- custom Git implementation
- custom file format ecosystem
- full chat application
- arbitrary plugin marketplace
- complex access-control system
- guaranteed support for every file type
- large-scale distributed consensus
- building our own canvas/editor when existing primitives work
- Tauri/native packaging unless it becomes necessary for a specific capability

A small hosted control plane **is in scope** for authentication, room metadata/membership, and signaling/rendezvous. It does not own the collaborative room contents.

### Expected TypeScript stack

The initial scaffold is intended to use:

- TanStack Start
- Hono
- Bun
- tRPC
- Better Auth
- PostgreSQL
- Drizzle
- Turborepo
- oxlint
- **skills** addon

The database is for control-plane data such as users, sessions, devices/peer identities, rooms, members, ownership metadata, invites, and signaling/rendezvous metadata. Room content remains peer-local and peer-replicated.

---

# The demo story

The best demo should make the distributed nature obvious.

### Act 1 — Collaboration

Three devices join one room.

Users interact with the same canvas and artifacts.

### Act 2 — Failure

One device is disconnected completely.

The remaining peers continue working.

The disconnected peer also continues working locally.

### Act 3 — Recovery

The disconnected peer returns.

Its changes reconcile automatically.

### Act 4 — Ownership failure

The original owner disappears.

The remaining peers continue.

A new owner is elected/transferred.

### Act 5 — Memory

Open the room history.

Inspect what happened while a peer was away.

Rewind to an earlier checkpoint.

The final message is:

> **The room survives the network, the devices, and the person who originally created it.**

---

# Product thesis

Centralized collaboration treats the server as the place where the shared project exists.

This project treats the **room itself as the distributed object**.

The network is merely how replicas find and synchronize one another.

The specific UI—canvas, editor, viewer—is replaceable.

The durable history is not reinvented; Git gives us a proven distributed history model.

The hackathon challenge is therefore not “make a decentralized whiteboard.”

It is:

> **Build a collaboration room that remains a coherent shared object even when its peers disconnect, fail, reconnect, and change ownership.**

---

# Current technical questions to resolve during implementation design

- Which live-sync mechanism should be used for each surface?
- What exactly is persisted as Git state versus live CRDT state?
- How are Git commits created from live collaborative changes?
- How are artifact blobs referenced and fetched peer-to-peer?
- How is ownership transferred safely among remaining peers?
- What happens when multiple peers disappear simultaneously?
- Which transport gives the fastest reliable browser-first MVP: WebRTC, iroh through a native/Tauri path, or a hybrid?
- How much of the room protocol should be transport-independent?
- What is the smallest conflict/merge experience needed for the demo?

These are implementation/design questions; they should not expand the product scope unless a decision forces it.
