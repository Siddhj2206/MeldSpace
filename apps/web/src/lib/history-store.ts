import { digest } from "lib0/hash/sha256";
import * as Y from "yjs";

/**
 * Durable room history as a content-addressed checkpoint log (#6).
 *
 * A checkpoint is a full snapshot of the room's `Y.Doc` (`Y.encodeStateAsUpdate`)
 * addressed by SHA-256, chained by parent hash, and carrying author + timestamp.
 * Checkpoints live in the *same* `Y.Doc` as the room content (a `Y.Map` of
 * immutable nested maps), so they replicate peer-to-peer over the existing
 * `y-webrtc` provider and persist in the existing `y-indexeddb` store with no
 * extra transport or storage code. Presence never enters the log (CONTEXT.md:
 * presence never enters history); only durable snapshot bytes do.
 *
 * Growth note: each snapshot embeds the checkpoint map itself, so snapshots grow
 * monotonically with history length. Fine for the 36h MVP (tens of checkpoints
 * of a text room); revisit (delta snapshots / separate doc) if history grows
 * large. isomorphic-git stays an *optional* export path only — see
 * `history-git-export.ts` — and must never become a runtime dependency of this
 * module.
 *
 * Frozen interface for the history UI (#7): `Checkpoint`, `CheckpointMeta`,
 * `HistoryStore.{createCheckpoint,list,get,heads,after,since,inspect,subscribe}`.
 */

export const CHECKPOINTS_MAP_NAME = "meldspace:checkpoints:v1";

/** Yjs shared-text type that checkpoints snapshot for the preview. */
export const DEFAULT_TEXT_TYPE_NAME = "content";

export const TEXT_PREVIEW_MAX_LENGTH = 160;

export type CheckpointAuthor = {
  /** Stable per-device id (control-plane `device.register` id once #17 lands; local id until then). */
  deviceId: string;
  displayName: string;
};

export type Checkpoint = {
  /** Content address: hex SHA-256 over (parent, author, timestamp, snapshot). */
  id: string;
  /** Parent checkpoint id, or null for the genesis checkpoint. Forks share a parent. */
  parent: string | null;
  authorDeviceId: string;
  authorName: string;
  /** Unix epoch millis. */
  createdAt: number;
  /** Hex SHA-256 of the raw snapshot bytes alone. */
  snapshotHash: string;
  /**
   * Hex SHA-256 of the room content (the shared text) at checkpoint time.
   * Snapshots embed the checkpoint log itself, so snapshot bytes change with
   * every checkpoint; `contentHash` is what decides "nothing changed" and what
   * lets #7 tell whether the room moved since a checkpoint.
   */
  contentHash: string;
  /** First chars of the room text at checkpoint time; lets #7 render without decoding. */
  textPreview: string;
  label: string;
  /** Full `Y.encodeStateAsUpdate(doc)` payload. Restored via `inspect` or `Y.applyUpdate`. */
  snapshot: Uint8Array;
};

export type CheckpointMeta = Omit<Checkpoint, "snapshot">;

export type CreateCheckpointOptions = {
  label?: string;
};

const NO_PARENT = "";

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === undefined) continue;
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

function sha256Hex(data: Uint8Array): string {
  return toHex(digest(data));
}

const textEncoder = new TextEncoder();

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Canonical bytes hashed into the checkpoint id. Field separators are NUL bytes. */
function checkpointIdBytes(
  parent: string,
  author: CheckpointAuthor,
  createdAt: number,
  snapshot: Uint8Array,
): Uint8Array {
  const sep = new Uint8Array([0]);
  return concatBytes([
    textEncoder.encode(parent),
    sep,
    textEncoder.encode(author.deviceId),
    sep,
    textEncoder.encode(author.displayName),
    sep,
    textEncoder.encode(String(createdAt)),
    sep,
    snapshot,
  ]);
}

function byTimeThenId(a: CheckpointMeta, b: CheckpointMeta): number {
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function readField(map: Y.Map<unknown>, key: string): unknown {
  return map.get(key);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBytes(value: unknown): Uint8Array | null {
  return value instanceof Uint8Array ? value : null;
}

export class HistoryStore {
  private readonly doc: Y.Doc;
  private readonly map: Y.Map<Y.Map<unknown>>;
  private readonly textTypeName: string;

  constructor(doc: Y.Doc, options?: { mapName?: string; textTypeName?: string }) {
    this.doc = doc;
    this.map = doc.getMap<Y.Map<unknown>>(options?.mapName ?? CHECKPOINTS_MAP_NAME);
    this.textTypeName = options?.textTypeName ?? DEFAULT_TEXT_TYPE_NAME;
  }

  /**
   * Capture the current doc state as a checkpoint. Returns the current head
   * without writing when the room content is unchanged since the head, so idle
   * timers and double-clicks cannot spam the log. (Dedup keys on the content
   * hash, not the snapshot bytes: each checkpoint is stored in the doc itself,
   * so snapshot bytes always differ from the previous call.)
   */
  createCheckpoint(author: CheckpointAuthor, options?: CreateCheckpointOptions): CheckpointMeta {
    const deviceId = author.deviceId.trim();
    const displayName = author.displayName.trim();
    if (!deviceId) throw new Error("HistoryStore: author.deviceId must be non-empty.");
    if (!displayName) throw new Error("HistoryStore: author.displayName must be non-empty.");
    const label = (options?.label ?? "").trim().slice(0, 140);

    const text = this.doc.getText(this.textTypeName).toString();
    const contentHash = sha256Hex(textEncoder.encode(text));
    const head = this.head();
    if (head && asString(readField(head.fields, "contentHash")) === contentHash) {
      return this.toMeta(head.id, head.fields);
    }

    const snapshot = Y.encodeStateAsUpdate(this.doc);
    const snapshotHash = sha256Hex(snapshot);

    const createdAt = Date.now();
    const parent = head?.id ?? null;
    const cleanAuthor: CheckpointAuthor = { deviceId, displayName };
    const id = sha256Hex(checkpointIdBytes(parent ?? NO_PARENT, cleanAuthor, createdAt, snapshot));
    const textPreview = text.slice(0, TEXT_PREVIEW_MAX_LENGTH);

    const fields = new Y.Map<unknown>();
    fields.set("parent", parent ?? NO_PARENT);
    fields.set("authorDeviceId", deviceId);
    fields.set("authorName", displayName);
    fields.set("createdAt", createdAt);
    fields.set("snapshotHash", snapshotHash);
    fields.set("contentHash", contentHash);
    fields.set("textPreview", textPreview);
    fields.set("label", label);
    fields.set("snapshot", snapshot);

    this.doc.transact(() => {
      // Content addressing dedups naturally: re-adding a known id is a no-op write.
      if (!this.map.has(id)) this.map.set(id, fields);
    });
    const stored = this.map.get(id);
    if (!stored) throw new Error("HistoryStore: failed to store checkpoint.");
    return this.toMeta(id, stored);
  }

  /** All checkpoints, oldest first. Forks (shared parent) sort by (createdAt, id). */
  list(): CheckpointMeta[] {
    const out: CheckpointMeta[] = [];
    this.map.forEach((fields, id) => {
      out.push(this.toMeta(id, fields));
    });
    out.sort(byTimeThenId);
    return out;
  }

  /** Full checkpoint including snapshot bytes, or null when unknown. */
  get(id: string): Checkpoint | null {
    const fields = this.map.get(id);
    if (!fields) return null;
    const snapshot = asBytes(readField(fields, "snapshot"));
    if (!snapshot) return null;
    return { ...this.toMeta(id, fields), snapshot };
  }

  /** Tip checkpoints: ids no other checkpoint names as parent. Usually one; more means a fork. */
  heads(): CheckpointMeta[] {
    const parented = new Set<string>();
    this.map.forEach((fields) => {
      const parent = asString(readField(fields, "parent"));
      if (parent !== NO_PARENT) parented.add(parent);
    });
    return this.list().filter((meta) => !parented.has(meta.id));
  }

  /**
   * Checkpoints strictly newer than `id` (by list order) — the "while you were
   * away" slice for #7. Unknown id returns the whole log.
   */
  after(id: string): CheckpointMeta[] {
    const all = this.list();
    const index = all.findIndex((meta) => meta.id === id);
    return index < 0 ? all : all.slice(index + 1);
  }

  /** Checkpoints created after `timestamp` (exclusive). */
  since(timestamp: number): CheckpointMeta[] {
    return this.list().filter((meta) => meta.createdAt > timestamp);
  }

  /**
   * Materialise a checkpoint into a detached doc for read-only inspection.
   * Never applied to the live room doc — rewind stays out of scope (stretch).
   */
  inspect(id: string): Y.Doc | null {
    const checkpoint = this.get(id);
    if (!checkpoint) return null;
    const detached = new Y.Doc();
    Y.applyUpdate(detached, checkpoint.snapshot);
    return detached;
  }

  /**
   * Observe the log. Checkpoints are immutable after creation, so a top-level
   * map observation covers every change; the listener receives the fresh list.
   */
  subscribe(listener: (checkpoints: CheckpointMeta[]) => void): () => void {
    const handler = () => listener(this.list());
    this.map.observe(handler);
    return () => this.map.unobserve(handler);
  }

  private head(): { id: string; fields: Y.Map<unknown> } | null {
    let bestId: string | null = null;
    let bestFields: Y.Map<unknown> | null = null;
    let bestTime = -1;
    this.map.forEach((fields, id) => {
      const time = asNumber(readField(fields, "createdAt"));
      if (bestId === null || time > bestTime || (time === bestTime && id > bestId)) {
        bestId = id;
        bestFields = fields;
        bestTime = time;
      }
    });
    return bestId !== null && bestFields !== null ? { id: bestId, fields: bestFields } : null;
  }

  private toMeta(id: string, fields: Y.Map<unknown>): CheckpointMeta {
    const parent = asString(readField(fields, "parent"));
    const snapshotHashStored = asString(readField(fields, "snapshotHash"));
    // Older peers may see the snapshot before its hash field arrives; derive a
    // fallback from the bytes we do have so the UI never renders blank.
    const snapshot = asBytes(readField(fields, "snapshot"));
    return {
      id,
      parent: parent === NO_PARENT ? null : parent,
      authorDeviceId: asString(readField(fields, "authorDeviceId")),
      authorName: asString(readField(fields, "authorName")),
      createdAt: asNumber(readField(fields, "createdAt")),
      snapshotHash:
        snapshotHashStored !== "" ? snapshotHashStored : snapshot ? sha256Hex(snapshot) : "",
      contentHash: asString(readField(fields, "contentHash")),
      textPreview: asString(readField(fields, "textPreview")),
      label: asString(readField(fields, "label")),
    };
  }
}
