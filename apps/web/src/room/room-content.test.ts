import { describe, expect, test } from "bun:test";
import * as Y from "yjs";

import { ensureProject } from "./project/migrate";
import { createProjectFile, readProjectText } from "./project/project";
import { readRoomContent } from "./room-content";

/**
 * The checkpoint log dedups on `readRoomContent.canonical`. A project edit that
 * leaves that hash unchanged would be silently never checkpointed (#6), so the
 * project maps must feed the canonical view.
 */
describe("readRoomContent", () => {
  test("changes when a project file changes", () => {
    const doc = new Y.Doc();
    ensureProject(doc);
    createProjectFile(doc, "main.tex", "a");

    const before = readRoomContent(doc).canonical;
    readProjectText(doc, "main.tex")!.insert(1, "b");

    expect(readRoomContent(doc).canonical).not.toBe(before);
    expect(readRoomContent(doc).preview).toContain("ab");
  });
});
