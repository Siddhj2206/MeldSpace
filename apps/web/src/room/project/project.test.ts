import { describe, expect, test } from "bun:test";
import * as Y from "yjs";

import { ensureProject, seedSampleProject } from "./migrate";
import {
  createProjectFile,
  createProjectUndoManager,
  deleteProjectFile,
  getProjectAsset,
  hasProjectFile,
  listProjectFiles,
  projectMainFile,
  projectSchemaVersion,
  readProjectText,
  renameProjectFile,
  setProjectAsset,
  snapshotProjectTexts,
} from "./project";
import { PROJECT_SCHEMA_VERSION, TEXTS_MAP_NAME } from "./types";

/** A room with the sample paper, as the room-creation flow (#25) would make it. */
function peerWithProject(): Y.Doc {
  const doc = new Y.Doc();
  ensureProject(doc);
  seedSampleProject(doc);
  return doc;
}

/** One bidirectional round trip — roughly what y-webrtc keeps doing. */
function converge(a: Y.Doc, b: Y.Doc): void {
  const fromA = Y.encodeStateAsUpdate(a);
  const fromB = Y.encodeStateAsUpdate(b);
  Y.applyUpdate(b, fromA);
  Y.applyUpdate(a, fromB);
}

function text(doc: Y.Doc, path: string): string {
  return readProjectText(doc, path)?.toString() ?? "";
}

describe("seedSampleProject", () => {
  test("creates the sample paper and marks the schema", () => {
    const doc = new Y.Doc();
    ensureProject(doc);
    seedSampleProject(doc);

    const paths = listProjectFiles(doc).map((file) => file.path);
    expect(paths).toEqual(["main.tex", "sections/intro.tex", "refs.bib"]);
    expect(text(doc, "main.tex")).toContain("\\input{sections/intro}");
    expect(text(doc, "refs.bib")).toContain("@misc{meldspace");
    expect(projectMainFile(doc)).toBe("main.tex");
    expect(projectSchemaVersion(doc)).toBe(PROJECT_SCHEMA_VERSION);
  });

  test("is idempotent and does not overwrite edits", () => {
    const doc = peerWithProject();
    readProjectText(doc, "main.tex")!.insert(0, "% edited\n");

    seedSampleProject(doc);

    expect(text(doc, "main.tex").startsWith("% edited")).toBe(true);
  });
});

describe("ensureProject", () => {
  test("migrates legacy `content` into main.tex and keeps the old text", () => {
    const doc = new Y.Doc();
    doc.getText("content").insert(0, "legacy meeting notes");

    ensureProject(doc);

    expect(text(doc, "main.tex")).toBe("legacy meeting notes");
    expect(doc.getText("content").toString()).toBe("legacy meeting notes");
    expect(projectSchemaVersion(doc)).toBe(PROJECT_SCHEMA_VERSION);
    // A legacy room gets its content, not the sample's extra files.
    expect(hasProjectFile(doc, "refs.bib")).toBe(false);
  });

  test("does not seed an empty room from one device joining an existing one", () => {
    // A late joiner opens its own empty replica before it hears from peers.
    const joiner = new Y.Doc();
    ensureProject(joiner);
    expect(listProjectFiles(joiner)).toEqual([]);

    // The room it joins has since renamed and deleted sample files.
    const room = peerWithProject();
    renameProjectFile(room, "main.tex", "paper.tex");
    deleteProjectFile(room, "refs.bib");
    converge(joiner, room);

    expect(hasProjectFile(joiner, "main.tex")).toBe(false);
    expect(hasProjectFile(joiner, "refs.bib")).toBe(false);
    expect(hasProjectFile(joiner, "paper.tex")).toBe(true);
  });
});

describe("convergence", () => {
  test("two peers editing different files converge", () => {
    const a = peerWithProject();
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    readProjectText(a, "main.tex")!.insert(0, "% from a\n");
    readProjectText(b, "refs.bib")!.insert(0, "% from b\n");
    createProjectFile(b, "intro.tex", "\\section{Second}");

    converge(a, b);

    expect(snapshotProjectTexts(a)).toEqual(snapshotProjectTexts(b));
    expect(text(a, "main.tex").startsWith("% from a")).toBe(true);
    expect(text(a, "refs.bib").startsWith("% from b")).toBe(true);
    expect(text(a, "intro.tex")).toBe("\\section{Second}");
  });

  test("files survive a persistence round trip (encode/apply)", () => {
    const doc = peerWithProject();
    readProjectText(doc, "sections/intro.tex")!.insert(0, "% offline edit\n");

    const restored = new Y.Doc();
    Y.applyUpdate(restored, Y.encodeStateAsUpdate(doc));

    expect(snapshotProjectTexts(restored)).toEqual(snapshotProjectTexts(doc));
    expect(projectMainFile(restored)).toBe("main.tex");
  });
});

describe("rename", () => {
  test("is atomic, preserves content and order, and refuses to clobber", () => {
    const doc = peerWithProject();
    const before = listProjectFiles(doc).find((file) => file.path === "main.tex")!;
    readProjectText(doc, "main.tex")!.insert(0, "% keep me\n");

    expect(renameProjectFile(doc, "main.tex", "paper.tex")).toBe(true);

    expect(hasProjectFile(doc, "main.tex")).toBe(false);
    expect(text(doc, "paper.tex").startsWith("% keep me")).toBe(true);
    const after = listProjectFiles(doc).find((file) => file.path === "paper.tex")!;
    expect(after.order).toBe(before.order);

    // The entry point follows the file.
    expect(projectMainFile(doc)).toBe("paper.tex");

    // Refuses both a missing source and an existing target.
    expect(renameProjectFile(doc, "nope.tex", "other.tex")).toBe(false);
    expect(renameProjectFile(doc, "paper.tex", "refs.bib")).toBe(false);
    expect(text(doc, "refs.bib")).toContain("@misc{meldspace");
  });

  test("moves an asset reference with the file", () => {
    const doc = peerWithProject();
    const ref = { hash: "deadbeef", mime: "text/x-bibtex", size: 3 };
    setProjectAsset(doc, "refs.bib", ref);

    expect(renameProjectFile(doc, "refs.bib", "bibliography.bib")).toBe(true);

    expect(getProjectAsset(doc, "bibliography.bib")).toEqual(ref);
    expect(getProjectAsset(doc, "refs.bib")).toBeNull();
  });

  test("delete removes the file from every map", () => {
    const doc = peerWithProject();
    setProjectAsset(doc, "refs.bib", { hash: "abc", mime: "text/x-bibtex", size: 3 });

    expect(deleteProjectFile(doc, "refs.bib")).toBe(true);

    expect(hasProjectFile(doc, "refs.bib")).toBe(false);
    expect(getProjectAsset(doc, "refs.bib")).toBeNull();
  });
});

describe("cross-file undo", () => {
  test("one UndoManager over the texts map steps across files", () => {
    const doc = peerWithProject();
    // The acceptance expression, verbatim.
    const undoManager = new Y.UndoManager(doc.getMap(TEXTS_MAP_NAME));

    readProjectText(doc, "main.tex")!.insert(0, "% first\n");
    undoManager.stopCapturing();
    readProjectText(doc, "refs.bib")!.insert(0, "% second\n");
    undoManager.stopCapturing();

    undoManager.undo();
    expect(text(doc, "refs.bib").startsWith("% second")).toBe(false);
    expect(text(doc, "main.tex").startsWith("% first")).toBe(true);

    undoManager.undo();
    expect(text(doc, "main.tex").startsWith("% first")).toBe(false);

    undoManager.redo();
    expect(text(doc, "main.tex").startsWith("% first")).toBe(true);
  });

  test("the helper exposes the same stack", () => {
    const doc = peerWithProject();
    const undoManager = createProjectUndoManager(doc);
    readProjectText(doc, "sections/intro.tex")!.insert(0, "% x\n");
    undoManager.undo();
    expect(text(doc, "sections/intro.tex").startsWith("% x")).toBe(false);
  });
});

describe("assets", () => {
  test("stores a reference, never bytes", () => {
    const doc = peerWithProject();
    const ref = { hash: "deadbeef", mime: "image/png", size: 128 };
    setProjectAsset(doc, "figures/plot.png", ref);
    expect(getProjectAsset(doc, "figures/plot.png")).toEqual(ref);
  });
});

describe("file kinds", () => {
  test("classifies by extension", () => {
    const doc = peerWithProject();
    createProjectFile(doc, "notes.txt", "hi");
    createProjectFile(doc, "plot.png", "");
    expect(listProjectFiles(doc).find((file) => file.path === "notes.txt")?.kind).toBe("text");
    expect(listProjectFiles(doc).find((file) => file.path === "plot.png")?.kind).toBe("asset");
    expect(listProjectFiles(doc).find((file) => file.path === "main.tex")?.kind).toBe("tex");
    expect(listProjectFiles(doc).find((file) => file.path === "refs.bib")?.kind).toBe("bib");
  });
});
