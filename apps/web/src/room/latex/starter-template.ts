import * as Y from "yjs";

import { createDocument } from "../documents";

/**
 * Minimal single-file starter for the R2 demo (#27).
 *
 * Deliberately one `main.tex` with no bibliography: a single engine pass is
 * enough, and every package in the preamble (`article` only) ships in
 * `texlive-basic`, so an already-compiled document recompiles offline.
 */
export const STARTER_MAIN_TEX_PATH = "main.tex";

export const STARTER_MAIN_TEX = `\\documentclass{article}

\\title{MeldSpace paper}
\\author{}
\\date{}

\\begin{document}

\\maketitle

\\section{Hello}

Two peers edit this source; each peer clicks Recompile and renders their own
view of the shared room as PDF.

\\end{document}
`;

/**
 * Inserts the starter into the room through the existing documents model, so
 * it converges like any other file. Returns the new document id.
 */
export function seedStarterTemplate(doc: Y.Doc): string {
  const created = createDocument(doc, STARTER_MAIN_TEX_PATH);
  doc.transact(() => {
    created.text.insert(0, STARTER_MAIN_TEX);
  });
  return created.id;
}
