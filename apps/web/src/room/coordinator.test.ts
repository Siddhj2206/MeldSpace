import { describe, expect, test } from "bun:test";
import * as Y from "yjs";

import { coordinatorWinner, readClaims } from "./coordinator";

/**
 * Election semantics for #10. The React layer is a thin observe/elect loop;
 * what matters is that claims converge under Yjs merges exactly the way the
 * spec says: max(epoch), tie max(clientID), holder must be present.
 */

function claim(doc: Y.Doc, clientId: number, epoch: number) {
  const map = doc.getMap<number>("coordinator");
  doc.transact(() => {
    map.forEach((_, key) => map.delete(key));
    map.set(String(clientId), epoch);
  });
}

function merge(a: Y.Doc, b: Y.Doc) {
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
}

describe("coordinator election", () => {
  test("a present holder wins; absent claims lose", () => {
    const doc = new Y.Doc();
    claim(doc, 11, 3);
    claim(doc, 22, 4);
    // 11's stale claim was pruned by 22's handoff; only {22:4} remains.
    expect(coordinatorWinner(readClaims(doc), new Set([11, 22]))).toEqual({
      clientId: 22,
      epoch: 4,
    });
    // Holder disconnects → no present claimant → vacant.
    expect(coordinatorWinner(readClaims(doc), new Set([11]))).toBeNull();
  });

  test("a returning peer's stale epoch loses the merge (Act 4)", () => {
    const stale = new Y.Doc();
    const room = new Y.Doc();
    // Room moved on to epoch 6 while `stale` was away holding epoch 2.
    claim(room, 22, 6);
    claim(stale, 11, 2);
    merge(stale, room);

    const present = new Set([11, 22]);
    expect(coordinatorWinner(readClaims(stale), present)).toEqual({ clientId: 22, epoch: 6 });
    expect(coordinatorWinner(readClaims(room), present)).toEqual({ clientId: 22, epoch: 6 });
  });

  test("concurrent partition handoffs converge to one holder by (epoch, clientID)", () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    // Each side of the partition elected its own claimant at the same epoch.
    a.getMap<number>("coordinator").set("1", 5);
    b.getMap<number>("coordinator").set("9", 5);
    merge(a, b);

    const present = new Set([1, 9]);
    expect(readClaims(a)).toEqual(readClaims(b));
    expect(coordinatorWinner(readClaims(a), present)).toEqual({ clientId: 9, epoch: 5 });
  });
});
