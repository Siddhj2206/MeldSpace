import { useEffect, useState } from "react";
import * as Y from "yjs";

import { useRoom } from "./room-provider";

/**
 * The room's documents.
 *
 * The first document is the top-level `content` Y.Text from #2 — kept where it
 * is so existing rooms (and their IndexedDB replicas) keep syncing. Documents
 * created inside the shell live in a `documents` Y.Map of nested `Y.Text`s,
 * with titles in a sibling `document-titles` map. Both replicate like any
 * other room state.
 */
export type RoomDocument = {
  id: string;
  title: string;
  text: Y.Text;
  /** The legacy top-level `content` text rather than a map entry. */
  legacy: boolean;
};

export const LEGACY_DOCUMENT_ID = "document:content";
export const LEGACY_DOCUMENT_TITLE = "notes.md";

const DOCUMENTS_KEY = "documents";
const TITLES_KEY = "document-titles";

function documentsMap(doc: Y.Doc) {
  return doc.getMap<Y.Text>(DOCUMENTS_KEY);
}

function titlesMap(doc: Y.Doc) {
  return doc.getMap<string>(TITLES_KEY);
}

/** Create a new empty markdown document inside `doc` and return it. */
export function createDocument(doc: Y.Doc, title: string): RoomDocument {
  const id = `document:${crypto.randomUUID()}`;
  const text = new Y.Text();
  documentsMap(doc).set(id, text);
  titlesMap(doc).set(id, title);
  return { id, title, text, legacy: false };
}

/** Live list of the room's documents, legacy text first. */
export function useRoomDocuments(): RoomDocument[] {
  const { runtime } = useRoom();
  const [documents, setDocuments] = useState<RoomDocument[]>([]);

  useEffect(() => {
    if (!runtime) {
      setDocuments([]);
      return;
    }
    const { doc } = runtime;
    const docs = documentsMap(doc);
    const titles = titlesMap(doc);

    const read = () => {
      const list: RoomDocument[] = [
        {
          id: LEGACY_DOCUMENT_ID,
          title: LEGACY_DOCUMENT_TITLE,
          text: doc.getText("content"),
          legacy: true,
        },
      ];
      docs.forEach((text, id) => {
        if (!(text instanceof Y.Text)) return;
        list.push({
          id,
          title: titles.get(id) ?? "Untitled.md",
          text,
          legacy: false,
        });
      });
      setDocuments(list);
    };

    docs.observe(read);
    titles.observe(read);
    read();
    return () => {
      docs.unobserve(read);
      titles.unobserve(read);
    };
  }, [runtime]);

  return documents;
}
