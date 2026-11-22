import * as Y from "yjs";

/**
 * Content-addressed blob transport (#8).
 *
 * Blob bytes ride in their own `Y.Doc` — `<roomId>-blobs` — with its own
 * `y-webrtc` provider and `y-indexeddb` store. That keeps the transport
 * genuinely peer-to-peer and *separate* from the room's metadata (the
 * `assets` map holds only `{hash, mime, size}` refs, per #24), and it keeps
 * megabytes of image data out of checkpoint snapshots, which serialise the
 * whole room doc.
 *
 * Content addressing is SHA-256 over the bytes: the same upload on two peers
 * lands one entry, and a peer that joins late picks blobs up on merge like
 * any other CRDT state. Nothing touches the control plane.
 */

export const BLOBS_MAP_NAME = "blobs";

export type BlobEntry = {
  mime: string;
  size: number;
  data: Uint8Array;
};

async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export class BlobStore {
  private readonly map: Y.Map<BlobEntry>;
  private readonly urlCache = new Map<string, string>();

  constructor(private readonly doc: Y.Doc) {
    this.map = doc.getMap<BlobEntry>(BLOBS_MAP_NAME);
  }

  /** Store bytes under their content hash. Idempotent — same bytes, same key. */
  async put(data: Uint8Array, mime: string): Promise<string> {
    const hash = await sha256Hex(data);
    if (!this.map.has(hash)) {
      this.doc.transact(() => {
        this.map.set(hash, { mime, size: data.byteLength, data });
      });
    }
    return hash;
  }

  has(hash: string): boolean {
    return this.map.has(hash);
  }

  get(hash: string): BlobEntry | null {
    return this.map.get(hash) ?? null;
  }

  /**
   * Object URL for the blob, or null until the bytes arrive. Peers that lack
   * the blob subscribe via `observe` and get it on merge — nothing is fetched
   * eagerly, and there is no central copy to fetch from.
   */
  objectUrl(hash: string): string | null {
    const cached = this.urlCache.get(hash);
    if (cached) return cached;
    const entry = this.map.get(hash);
    if (!entry) return null;
    const url = URL.createObjectURL(
      new Blob([entry.data.buffer.slice(0) as ArrayBuffer], { type: entry.mime }),
    );
    this.urlCache.set(hash, url);
    return url;
  }

  /** Call `listener` whenever the blob map changes (e.g. a blob arrived from a peer). */
  observe(listener: () => void): () => void {
    const handler = () => listener();
    this.map.observe(handler);
    return () => this.map.unobserve(handler);
  }
}
