import * as Y from "yjs";

import { DEFAULT_TEXT_TYPE_NAME, type RoomContent } from "@/lib/history-store";

export const DOCUMENTS_KEY = "documents";
export const TITLES_KEY = "document-titles";

/**
 * Canonical view of every document in the room, for the checkpoint log.
 *
 * Checkpoints dedup on this hash, so it must cover the legacy `content` text
 * *and* every `documents` entry (text + title); otherwise an edit to a
 * non-legacy document leaves the hash unchanged and is silently never
 * checkpointed. Entries are sorted by id so every replica computes the same
 * bytes.
 */
export function readRoomContent(doc: Y.Doc): RoomContent {
  const legacy = doc.getText(DEFAULT_TEXT_TYPE_NAME).toString();
  const titles = doc.getMap<string>(TITLES_KEY);
  const entries: { id: string; title: string; text: string }[] = [];
  doc.getMap<Y.Text>(DOCUMENTS_KEY).forEach((text, id) => {
    if (!(text instanceof Y.Text)) return;
    entries.push({ id, title: titles.get(id) ?? "Untitled.md", text: text.toString() });
  });
  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    canonical: JSON.stringify({
      content: legacy,
      documents: entries.map((entry) => [entry.id, entry.title, entry.text]),
    }),
    // Prefer the legacy text for the preview; fall back to the new documents.
    preview: legacy || entries.map((entry) => entry.text).join("\n"),
  };
}
