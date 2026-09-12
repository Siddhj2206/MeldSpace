# 3. AGPL-3.0 client, to use the maintained browser-TeX stack

Date: 2026-09-12
Status: accepted

## Context
The LaTeX lane needs two mature components: the CodeMirror LaTeX grammar (`codemirror-lang-latex`) and
the in-browser TeX engine (`texlyre-busytex`). Both are AGPL-3.0-or-later, as is TeXlyre, the reference
implementation. The MIT alternatives are pre-alpha (`@typeward/texlive-wasm`, `@siglum/engine`) or too
weak (legacy `stex`, highlight-only). MeldSpace had no license file, and the choice had to be made
before any of these dependencies were added.

## Decision
MeldSpace is licensed **AGPL-3.0-or-later**. The web client may depend on `codemirror-lang-latex` and
`texlyre-busytex` directly. `LICENSE` holds the canonical AGPL-3.0 text.

## Consequences
- Anyone who runs a modified MeldSpace over a network must be offered the source. Acceptable here, and
  the same choice TeXlyre made.
- We are not restricted to the pre-alpha MIT engines; `@typeward/texlive-wasm`, `@siglum/engine` and a
  Tectonic WASM build remain migration options if the license is revisited.
- Dependency review must stay AGPL-compatible; no proprietary-only dependencies in the client bundle.
- Commercial relicensing would require replacing the AGPL components. This is a product decision, not
  legal advice.

## Alternatives considered
- **MIT-only client** — rejected: the only maintained browser-TeX engine (`texlyre-busytex`) is AGPL,
  and the MIT alternatives are pre-alpha. Staying permissive costs a weaker editor and an unstable engine.
- **Compile as a separate AGPL service, keep the client permissive** — deferred: the license boundary is
  legally subtle (research flagged it as counsel territory) and it adds a server to an offline-first path.
