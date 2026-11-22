import * as Y from "yjs";

import { createProjectFile, hasProjectFile } from "../project/project";

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
 * Inserts the starter into the room's project model (#24), so it converges
 * like any other file. No-op when `main.tex` already exists.
 */
export function seedStarterTemplate(doc: Y.Doc): void {
  if (hasProjectFile(doc, STARTER_MAIN_TEX_PATH)) return;
  createProjectFile(doc, STARTER_MAIN_TEX_PATH, STARTER_MAIN_TEX);
}
