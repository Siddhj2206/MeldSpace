# Local-first / P2P paper writing: who already does it, and where the gap is

- **Date:** 2026-09-12
- **Access date for all sources:** 2026-09-12
- **Question:** If MeldSpace pivots toward a local-first / P2P "Overleaf" for academic
  paper writing, who already does this, and is there a genuinely differentiatable wedge?
- **Method:** primary sources first — project sites, GitHub API metadata, official docs,
  npm registry, source READMEs, arXiv/publisher docs. Secondary sources (blogs, tool
  directories, press) are labelled. Claims that are inference, not documented fact, are
  marked **[inference]**. Version/star figures are as of 2026-09-12 and will drift.
- **Constraint:** This research is read-only on the MeldSpace codebase; nothing was
  modified except this file. Paper MCP was not used.

---

## TL;DR

**Yes, "local-first P2P Overleaf" is already taken — by TeXlyre, which is active, funded,
AGPL, supports both LaTeX and Typst with in-browser compilation, and does WebRTC + Yjs +
IndexedDB offline collaboration with no-account share URLs.** It is not a toy and it is
not a demo. On top of that, OpenAI's free cloud **Prism** (built on the acquired Crixet)
now gives away a LaTeX-native workspace with unlimited collaborators and GPT-5.2, and
**Overleaf** still owns the default. "P2P collab" is not the differentiator; neither is
"supports Typst".

**Format is not the wedge, either.** LaTeX is table stakes because arXiv and most
publishers require LaTeX *source*, not just a PDF. Typst is technically the nicest thing
to put in a browser (small WASM, milliseconds), but arXiv and most publisher pipelines do
not accept Typst source yet, so a Typst-only tool risks a dead end at submission time.
Markdown + Pandoc is the most browser-tractable and most differentiated authoring model,
but it still ends in an export-to-LaTeX conversion step for submission.

**The least-crowded adjacent wedge is not "write the paper" — it is the paper's revision
lifecycle.** A durable, offline-first change ledger across review rounds ("what changed
while I was away / since the version I sent the reviewer"), with no-account access and
rewind, attached to a project rather than replacing its editor. MeldSpace's checkpoint
log, "while you were away", coordinator handoff, and offline convergence map onto that
job far better than onto "be another Overleaf". Even so, that is closer to a
feature-set-plus-workflow than a new platform, and Overleaf already ships a (premium,
server-side) version of history. Be honest about that.

---

## Part A — Landscape

### 1. TeXlyre is a direct, live "P2P Overleaf" — verified

TeXlyre (`TeXlyre/texlyre`) describes itself as *"a local-first LaTeX & Typst web editor
with real-time collaboration & offline support."* It is, for practical purposes, exactly
the product this pivot describes.

**Repo facts (GitHub API, 2026-09-12):**

| Field | Value |
| --- | --- |
| Created | 2025-07-06 |
| Last push | 2026-09-08 |
| Stars / forks | **945 / 69** |
| Open issues | 5 |
| Language | TypeScript |
| License | **AGPL-3.0** |
| Latest release | **v0.12.0 (2026-09-06)**; monthly-ish release cadence since late 2025 |
| Homepage | https://texlyre.github.io/texlyre/ |
| Hosted instance | https://texlyre.org/texlyre (linked from official docs) |

**Stack (from README + docs):**
- React + TypeScript; CodeMirror 6 editor; PDF.js viewer.
- **Yjs CRDTs** for conflict-free merge; **WebRTC peer-to-peer** synchronisation
  (`y-webrtc`-based signalling); **IndexedDB** local persistence for offline editing.
- In-browser compilation with **SwiftLaTeX** (TeX Live 2020, pdfTeX/XeTeX/LuaTeX) and
  **texlyre-busytex** (TeX Live 2026, adds LuaTeX + SyncTeX). Typst via **typst.ts**.
- **FilePizza** for WebRTC peer-to-peer transfer of large non-text files.
- Comments + chat, Zotero/OpenAlex reference search, Draw.io / TikZ diagram surfaces.
- Git sync to GitHub/GitLab/Gitea/Forgejo with three-way merge; file-system backup.
- A companion local app, **Chelys**, for LSP integration, local typesetting engines, and
  distributed storage.
- **NLnet-funded** (NGI), which is a signal of institutional seriousness, not a hobby.

**Is it a direct P2P Overleaf? Yes.** Share a project by URL fragment
(`#yjs:<id>`), collaborate over WebRTC, keep editing offline in IndexedDB, converge on
reconnect, compile locally in WASM, no central document store required. It even has a
public hosted instance and a self-host infrastructure repo. This is the exact pitch of
the candidate pivot, already shipped.

**Where TeXlyre is thin (the only opening): [inference]**
- The docs describe local persistence, Git sync, exports, and backups, but **no
  first-class durable checkpoint/rewind UI** and no "what changed while I was away"
  surface. The Git integration is the closest thing to history; it is file-oriented, not
  a room-history timeline. (This is inferred from the docs' feature map; absence of a
  documented feature is not proof it does not exist.)
- No coordinator / authority / epoch concept. Collaboration is flat and peer-to-peer;
  there is no "who sequences membership and checkpoints" role, because TeXlyre does not
  need one.
- No explicit guarantee language around offline convergence as a *product* story; it is
  framed as a capability, not the thesis.

**Strategic note:** TeXlyre is **AGPL-3.0**. If MeldSpace wanted to build here, the
highest-leverage honest option might be to contribute a checkpoint/revision layer to
TeXlyre rather than write a competing editor from scratch. AGPL is a real constraint for
a proprietary product, but it is an option worth naming.

### 2. Overleaf owns the default — and its weaknesses are the ones everyone cites

Overleaf is cloud/server-authoritative, not P2P and not offline-first. Its free tier is
the thing competitors attack:

- **Free plan:** 1 collaborator per project; **10-second compile timeout**; 24-hour
  history window; basic AI allowance; no track changes; no Git integration.
- **Premium:** 10 or unlimited collaborators; 240s compile; **full history** (label,
  compare, restore versions/files); **track changes**; Git + GitHub integrations.
- **Git integration limitations (official docs):** one linear history, no branches, no
  tags, no Git LFS, no submodules; symlinks and file renames are lossy; mixing Git with
  track changes/comments can lose that metadata. It is a translation layer over Overleaf's
  internal history, not "real git".
- **Offline:** only via manually cloning and pushing/pulling through the Git bridge, and
  only on paid plans / Server Pro. There is no offline editing session.

So the "why not Overleaf" story is real and well-worn: seat pricing, compile timeouts,
premium-gated history and Git, server dependence, and no genuine offline mode.

### 3. OpenAI's Prism (ex-Crixet) just made "free cloud Overleaf + AI" the new floor

- Launched **2026-01-27**; OpenAI acquired **Crixet**, a cloud LaTeX platform, and
  rebuilt it as **Prism**, powered by GPT-5.2. Free with a ChatGPT account.
- **Unlimited projects and collaborators**, real-time co-editing, built-in literature
  search and citation insertion, image/whiteboard-to-LaTeX, compile-error fixing.
- Per one detailed third-party review, Prism can also summarise co-author changes in
  natural language ("what did my co-authors change while I was gone?") — i.e. the
  "while you were away" *surface* already exists in a free competitor, albeit
  AI-generated and cloud-only. **[secondary source]**
- Cloud-only, account-required, no offline/P2P/local-first, and it does not solve data
  sovereignty or connectivity.

This matters because the pivot's implied thesis — "Overleaf is expensive and centralised"
— is no longer novel. Free, generous, AI-native LaTeX collaboration is now the baseline.

### 4. CoCalc — server-based, self-hostable, heavy

- Web service for collaborative Jupyter/Sage/LaTeX/code; real-time sync; built-in
  **TimeTravel** history/version control; a new LaTeX editor shipped in OnPrem 4.1.0
  (Jan 2026).
- Self-hosting is **Kubernetes-based** (CoCalc OnPrem) or a Docker image for small setups;
  it is a service, not a browser P2P room. No offline-first client story.
- **Verdict:** adjacent, not a direct competitor to a lightweight P2P paper room.

### 5. Authorea is effectively gone as an authoring tool

Authorea was acquired by Atypon/Wiley (2018) and is now a **preprint archive**, not a
collaborative editor. Authorea's own site states: *"Until further notice, we are only
supporting the posting of new preprints via the Under Review service. Authoring new or
updating existing preprints is currently unavailable."* Wiley migrated content to its
Research Exchange Preprints platform (2026). **Not a live competitor** for authoring.

### 6. Curvenote — cloud CMS + local CLI, Markdown/MyST, not LaTeX-native P2P

- Cloud authoring/SCMS with real-time collaboration, plus a **MIT-licensed CLI** that
  works locally and syncs (`curvenote sync/push/export`), exports to LaTeX/Word/PDF.
- Authoring is **MyST Markdown + Jupyter**, not LaTeX-first; the local path is
  content-transform + sync, not offline P2P editing.
- **Verdict:** different content model, different architecture; not the same race.

### 7. texlive.net and latexonline.cc are compile services, not products

- **texlive.net** (David Carlisle; hosted by a VM from Stefan Kottwitz, DANTE-supported)
  takes an HTTP POST and returns a PDF/log; used by learnlatex.org and forums. No
  document state, no collaboration.
- **latexonline.cc** compiles git repos/URLs/plain text to PDF via REST; MIT; Docker
  self-host.
- These are backend primitives a builder might use, not competitors.

### 8. VS Code + LaTeX Workshop + Git — the real incumbent for power users

- Local, offline, fast, unlimited compile, free; SyncTeX, Zotero via Better BibTeX, full
  Git branching/tagging/CI (`latexdiff`, `git-latexdiff`) for review diffs.
- Collaboration is asynchronous via Git/GitHub, not real-time; setup cost is real
  (~an hour, multi-GB TeX distribution, or Tectonic for lighter installs).
- This is the workflow that already satisfies "offline + version control + no Overleaf",
  for people willing to run a terminal. Any P2P product competes with *free and working*,
  not just with Overleaf.

### 9. Adjacent academic-authoring tools worth naming

| Tool | Model | Relevant to MeldSpace |
| --- | --- | --- |
| **Fidus Writer** (AGPL) | Server-based Django real-time collaborative academic editor; citations/formulas; exports LaTeX/DOCX/JATS; Git plugin | Real-time + academic, but server-authoritative, no offline/P2P |
| **Manubot** (BSD) | Markdown + Git/GitHub + Pandoc + CI; citation-by-identifier; automated builds | Async only; no real-time/offline editor; strong provenance story |
| **Stencila v2** (Rust, Automerge CRDT) | Local-first CRDT documents, version history/branching, JATS/LaTeX export; **alpha** | Closest *architecture* cousin; not LaTeX/paper-first, not a browser room |
| **ScienHub** | Cloud real-time LaTeX + Git + AI (listed in the Yjs ecosystem) | Cloud, account-based |
| **Litewrite** (HKUDS) | Next.js + Yjs WebSocket + Redis; version-history snapshots; AI | Server-authoritative; shows history UI is expected |
| **texleaf** (MIT) | Self-hosted Overleaf clone: FastAPI + Yjs/pycrdt + TeX Live | Server-based real-time |
| **Scribe** (`sunnyallana/scribe`, AGPL) | Self-host Rust + React/Tauri; Yjs over WebSocket; offline desktop SQLite mirror; voice; AI | Offline-first desktop, but server-relayed collaboration, not P2P |
| **ClaTeX** | Next.js + Monaco + Yjs + y-sweet + Claude + texlab LSP | Server-relayed |
| **TexFlow** | Go microservices + Yjs + Kong/MinIO | Server-based |
| **Oleafly** | Local-first **desktop**, Git-native, LaTeX/Typst/Markdown, bundled Tectonic | No live multi-user; collaboration = Git |
| **Opal** (ex-Tectonic Editor) | Offline-first desktop LaTeX, embedded Tectonic, optional AI | Single-user |
| **CollabTeX** | SvelteKit + Yjs/WebRTC + IndexedDB; client-side "compile" currently jsPDF placeholder | Closest demo-shaped P2P clone; appears small/unproven **[activity unverified]** |

The pattern is unmistakable: across 2024–2026 there is a dense cluster of "collaborative
LaTeX in the browser" projects. Most are server-relayed; a few are local-first; TeXlyre is
the one that combines local-first + P2P + offline + dual-format + browser compile and has
real traction and funding.

---

## Part B — Document formats: LaTeX vs Typst vs Markdown+Pandoc

### 10. LaTeX: the acceptance constraint makes it table stakes

- **arXiv requires (La)TeX source** for TeX submissions and processes it server-side with
  pinned TeX Live versions (currently TeX Live 2023 and 2025). PDF-only is accepted for
  some categories but is a fallback with manual moderation.
- Most journals/publishers expect LaTeX source or a publisher template; many compile it
  themselves.
- **Browser tractability:** proven but heavy. SwiftLaTeX (TeX Live 2020) and
  texlyre-busytex (TeX Live 2026) run pdfTeX/XeTeX/LuaTeX in WASM. TeXlyre documents the
  honest caveats: on-demand package/font downloads, slower first compile, and no native
  shell / host fonts, so packages depending on external programs may not work.
- **Ecosystem maturity:** unmatched — packages, classes, templates, tooling, reviewer
  expectations, and `latexdiff`-style change markup.

**Verdict:** LaTeX is not a differentiator, but it is the price of admission for a tool
whose endpoint is "get the paper accepted". A paper-writing tool that cannot produce
submittable LaTeX is a drafting toy.

### 11. Typst: technically the best browser target, ecosystem the blocker

- **Compiler:** Rust, **Apache-2.0**, ~56k GitHub stars, actively developed (repo pushed
  2026-09-12). Incremental and milliseconds-fast; native Unicode/UTF-8; a ~12 MB WASM
  compiler (plus ~350 KB renderer) versus multi-hundred-MB LaTeX distributions.
- **Browser kit:** **`@myriaddreamin/typst.ts`** is **Apache-2.0**, ~1.2k stars, active
  (repo pushed 2026-08-31); npm latest **0.7.0** with `typst-ts-web-compiler` and
  `typst-ts-renderer` peer modules. There are React and Angular renderer packages, a
  single-file previewer, and multiple community online editors (e.g. `Mapaor/typst-online-editor`).
- **Templates:** growing fast — IEEE (`charged-ieee`), ACM (`faithful-acmart`, tested
  against the real `acmart` class), Springer Nature (`stellar-springer-nature`), arXiv
  preprint (`arkheion`). Typst Universe has a package registry.
- **The blocker:** **arXiv does not accept Typst source** (as of the sources reviewed);
  authors submit the Typst-generated PDF as a fallback, or convert to LaTeX. Publishers
  overwhelmingly require LaTeX or PDF, and the Typst community's own forum threads
  describe the missing "distribution" contract (pinned compiler version + fonts +
  packages) that archival systems like arXiv need. Typst PDF accessibility tags landed
  around Typst 0.14 (per the `faithful-acmart` template), which is a positive signal.
- **Differentiation:** "we do Typst well" is real but **not a moat** — TeXlyre already
  ships Typst via typst.ts, and the format's acceptance gap makes it a risky primary bet.

**Verdict:** Best-in-class technical tractability; still a side bet until publishers and
arXiv accept Typst source. Great as an additional format; weak as the whole product.

### 12. Markdown + Pandoc: most browser-native, most differentiated authoring, but not a submission format

- **`pandoc-wasm`** wraps the **official Pandoc 3.9 WASM** binary; works in browsers and
  Node; MIT-ish upstream (Pandoc is GPL), used by the official "pandoc for the people"
  browser demo. Conversion to/from Markdown, LaTeX, DOCX, HTML, JATS, etc., with citeproc
  and CSL.
- Authoring in a structured Markdown/MyST model (the Curvenote/Quarto/Manubot lineage) is
  genuinely easier to CRDT-merge and to diff than raw LaTeX, and it supports
  content-vs-layout separation.
- **But** journals require LaTeX source or a fixed template; Pandoc's LaTeX output is an
  approximation that frequently needs hand-fixing for a specific venue. So a Markdown tool
  must still provide a first-class LaTeX/PDF export path, and often a "fix the generated
  `.tex`" workflow.

**Verdict:** The most interesting *authoring* model and the most defensible from a
merge/diff perspective, but it still ends at "export to submittable LaTeX", which is a
large build and only a partial answer.

### 13. Format recommendation for this team

If MeldSpace builds an editor at all: **target LaTeX (with Typst as a secondary format and
Markdown as an optional authoring front-end that exports LaTeX)**. Rationale:
- LaTeX is the hard constraint imposed by venues and arXiv; skipping it forfeits the
  endpoint.
- Typst is a nice-to-have that TeXlyre already covers and that publishers do not yet
  accept as source.
- Markdown + Pandoc is the most differentiated authoring layer but is a bigger build and
  still needs LaTeX output.

**Crucially: the format is not the wedge.** Choosing Typst does not differentiate against
TeXlyre, which already does both. The differentiation has to be in the workflow around the
document.

---

## Part C — The wedge

### 14. Start from the assets, and be honest about what they are worth

MeldSpace's stated assets: durable content-addressed checkpoint history and rewind;
"while you were away"; presence-derived coordinator handoff with epochs; offline
convergence; rooms; no-account join.

Classify each as **feature vs product**:

| Asset | What it really is | Sellable alone? |
| --- | --- | --- |
| Checkpoint history + rewind | **Table stakes.** Overleaf (premium), Google Docs, Typst Git sync, Litewrite, and Git all have some form. | No |
| "While you were away" | **Differentiation surface**, but Overleaf "compare versions" and Prism's AI change summary already gesture at it. | Only as a workflow |
| Coordinator handoff / epoch | **Internal mechanism**, invisible to users. | No — it is architecture, not value |
| Offline convergence | **Infrastructure.** Only sells if the user's pain is acute (fieldwork, travel, poor connectivity, data sovereignty). | Only as positioning |
| Rooms + no-account join | **Growth/access feature.** Real pain for external co-authors, PIs, industry collaborators. | As a wedge, not a moat |

The uncomfortable conclusion: MeldSpace's differentiating mechanisms are mostly invisible,
and its visible surfaces are things competitors already have. "P2P Overleaf" is a losing
positioning against a funded AGPL project (TeXlyre) and a free AI giant (Prism).

### 15. The job no one has claimed: the paper's revision lifecycle

Papers are not written once. They move through **rounds**: internal drafts → submitted
version → reviewer reports → rebuttal → camera-ready → sometimes a second venue. The
recurring, painful questions are:

- What changed since the version I sent the reviewer / since the last internal deadline?
- Which co-author (or which offline edit) introduced this?
- Can I get back to exactly the state we submitted, without a server account?
- My co-author is at another institution / on bad Wi-Fi / refuses yet another account.

Overleaf answers some of this only on premium, only server-side, and never while offline.
TeXlyre answers the connectivity and no-account parts but does not surface durable
round-based history. Git answers all of it for people who use Git — and nobody else.
`latexdiff`/`git-latexdiff` is the power-user's manual version of exactly this.

This is the least-crowded adjacent wedge: **not "a place to write the paper", but "the
paper's change ledger across rounds, that works offline and without accounts."**

### 16. Ranked wedges

**Wedge 1 (recommended): the revision-round ledger — "what changed since we submitted".**
- Product shape: keep the paper as plain LaTeX files (bring your own repo/Overleaf
  export); MeldSpace provides an offline-first room around it with **named checkpoints per
  round**, a readable **change set between any two checkpoints**, **rewind**, and
  **"while you were away"** for a given co-author. No account needed to join a round.
- Why it fits: it is the only wedge where the checkpoint log, offline convergence,
  coordinator (who seals a round), and no-account join are all load-bearing *and* visible.
- Honesty: history/diff is a **feature**, and Overleaf already sells a premium version.
  What makes it a *product* is the specific job (multi-round, multi-institution,
  low-connectivity, external co-authors) and the offline/no-account model. It is a real
  niche, not a mass market. **Confidence: medium.** The wedge is defensible only if the
  team commits to the revision job, not to "an editor".

**Wedge 2: no-account, offline-tolerant writing rooms for the messy co-author graph.**
- Product shape: a co-author opens a link/QR and co-edits immediately, on a plane or on
  hotel Wi-Fi, with no signup; the room persists and converges when connectivity returns.
- Why it fits: it exploits rooms + offline + no-account directly, and it attacks Overleaf's
  free-tier 1-collaborator limit and its cloud dependence.
- Honesty: **this is closer to go-to-market than a moat.** TeXlyre already joins by URL
  with optional accounts and works offline. It differentiates a *campaign*, not the
  software. **Confidence: medium-low as a standalone product; strong as the top of the
  funnel for Wedge 1.**

**Wedge 3: coordinator-governed lab/group projects.**
- Product shape: a PI or a group owns the room's *sequencing* (membership, sealed
  checkpoints) without owning the content; authority transfers when they leave, and a
  returning stale peer cannot reassert it.
- Why it fits: it is the one place MeldSpace's epoch/coordinator design is genuinely unique
  and technically interesting.
- Honesty: **users do not buy coordination protocols.** This is how the revision ledger
  stays coherent when the PI disappears; it is not a product by itself. **Confidence: low
  as a wedge; high as an enabling mechanism for Wedge 1.**

### 17. What to cut / what the honest answer is

- **Cut "P2P Overleaf for LaTeX/Typst" as the pitch.** It is already built, funded, and
  free-to-use (TeXlyre), and Prism reset the price of cloud collaboration to zero. Being
  the third-best Overleaf is not a business.
- **Cut "Typst-only" as a strategy.** Great tech, wrong acceptance constraint today.
- **Cut file-sync / team-drive generalisation.** That is Dropbox/Drive/CoCalc space.
- **Keep** the checkpoint log, offline convergence, and no-account join — but point them
  at the revision job, not at "authoring".
- **If even the revision wedge feels too thin,** the honest conclusion is: *paper writing
  is a crowded destination.* The room primitive is strong, but its best use may be a
  different vertical with the same shape (fieldwork, disaster response, research data
  collection, classroom labs) or a horizontal "offline-durable collaboration rooms"
  infrastructure play. Do not force it into paper writing just because LaTeX is familiar.

---

## Recommendation

1. **Do not enter as "a local-first / P2P Overleaf."** TeXlyre already is that, is
   AGPL-3.0, NLnet-funded, actively releasing, supports LaTeX *and* Typst with in-browser
   compilation, joins by URL without accounts, and works offline. Prism makes free cloud
   LaTeX + AI the baseline, and Overleaf owns the default. The positioning is dead on
   arrival.
2. **Do not pick a format as the moat.** LaTeX is required for arXiv/publisher
   submission; Typst is technically superior in the browser but not accepted as source by
   arXiv/most publishers; Markdown + Pandoc is the nicest authoring model but still exits
   to LaTeX. TeXlyre already covers the format axis anyway.
3. **If MeldSpace stays in this space, attack the revision lifecycle, not authoring.**
   Build the offline-first, no-account **change ledger across review rounds** — named
   checkpoints per round, readable diffs between rounds, rewind, and "while you were away"
   — on top of a project's existing LaTeX sources. Let the checkpoint log, offline
   convergence, and coordinator be the machinery underneath a job users actually name.
4. **Be brutally honest about the ceiling.** That wedge is a feature-set plus a vertical
   workflow, not a new platform, and it competes with a premium Overleaf feature and with
   Git. It is worth pursuing only if the team commits to the multi-round, multi-institution,
   low-connectivity job and treats editor parity as a cost of entry rather than the
   product.
5. **If that commitment is not there, change the vertical — not the pitch.** The room
   primitive is the asset; "paper writing" is a crowded place to apply it.

---

## Sources

All URLs accessed **2026-09-12**.

**TeXlyre (primary)**
- Repo: https://github.com/TeXlyre/texlyre
- GitHub API metadata (stars 945, forks 69, AGPL-3.0, created 2025-07-06): https://api.github.com/repos/TeXlyre/texlyre
- Releases (v0.12.0, 2026-09-06): https://github.com/TeXlyre/texlyre/releases
- Docs — introduction / local-first / compilation / storage: https://texlyre.github.io/docs/getting-started/introduction
- Docs — Git synchronization (three-way merge, `.yjs` state): https://texlyre.github.io/docs/git-synchronization
- Docs — project management: https://texlyre.github.io/docs/category/project-management
- Hosted instance: https://texlyre.org/texlyre
- Chelys local companion app: https://texlyre.org/chelys
- Self-host infrastructure: https://github.com/texlyre/texlyre-infrastructure
- NLnet project page: https://nlnet.nl/project/Texlyre/
- teXlyre-busytex (TeX Live 2026 WASM): https://github.com/TeXlyre/texlyre-busytex
- SwiftLaTeX: https://github.com/SwiftLaTeX/SwiftLaTeX

**Overleaf (primary)**
- Plan limits (10s free compile, 7 MB, 2 MB file): https://docs.overleaf.com/getting-started/free-and-premium-plans/plan-limits
- Premium features (collaborators, track changes, full history): https://docs.overleaf.com/getting-started/free-and-premium-plans/premium-features
- History and versioning (24h free / full premium, compare, restore): https://docs.overleaf.com/writing-and-editing/history-and-versioning
- Git integration + known limitations (no branches/tags/LFS/submodules): https://docs.overleaf.com/integrations-and-add-ons/git-integration-and-github-synchronization/git-integration
- GitHub synchronization limitations: https://docs.overleaf.com/integrations-and-add-ons/git-integration-and-github-synchronization/github-synchronization.md
- Pricing: https://www.overleaf.com/user/subscription/plans
- CE Git bridge is not supported (issue #782): https://github.com/overleaf/overleaf/issues/782

**Prism / Crixet (primary + secondary)**
- OpenAI Prism product page: https://openai.com/prism/
- OpenAI launch post (GPT-5.2, unlimited collaborators, built on Crixet): https://openai.com/index/introducing-prism/
- Crixet "now Prism": https://crixet.com/
- Proskauer (acquisition advisory, 2026-07-30): https://www.proskauer.com/release/proskauer-advises-crixet-on-acquisition-by-openai
- [secondary] third-party feature review with AI change-summary claim: https://ksml4.com/openai-prism-an-excellent-free-alternative-to-overleaf-for-scientific-writing-and-collaboration/

**CoCalc (primary)**
- Repo/README: https://github.com/sagemathinc/cocalc
- OnPrem docs/version history (Conat, new LaTeX editor Jan 2026): https://onprem.cocalc.com/
- LaTeX editor docs (TimeTravel, Side Chat; comments not yet implemented): https://doc.cocalc.com/latex

**Authorea (primary + secondary)**
- Authorea site notice (authoring unavailable): https://www.authorea.com/
- [secondary] Wikipedia status (Wiley Research Exchange migration, May 2026): https://en.wikipedia.org/wiki/Authorea

**Curvenote (primary)**
- Writing docs: https://curvenote.com/docs/write/index
- CLI docs (MIT, local sync/export): https://curvenote.com/docs/cli
- Repo: https://github.com/curvenote/curvenote

**Compile services (primary)**
- TeXLive.net server docs: https://davidcarlisle.github.io/latexcgi/
- TeXLive.net upgrade news (TeX Live 2025, DANTE): https://www.latex-project.org/news/2025/03/29/new-texlive-net/
- latexonline.cc: https://latexonline.cc/ ; repo: https://github.com/aslushnikov/latex-online

**VS Code / Git workflows (primary + secondary)**
- LaTeX Workshop: https://marketplace.visualstudio.com/items?itemName=James-Yu.latex-workshop
- GitHub Actions LaTeX template: https://github.com/paulbrenker/tex-github-workflow
- [secondary] local workflow write-ups: https://blog.shuvangkardas.com/overleaf-local-alternative-latex-in-vscode ,
  https://leolavaur.re/posts/latex_workflow/ (git-latexdiff)

**Adjacent tools (primary)**
- Fidus Writer: https://www.fiduswriter.org/ ; repo: https://github.com/fiduswriter/fiduswriter
- Manubot: https://manubot.org/ ; repo: https://github.com/manubot/manubot ;
  paper: https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1007128
- Stencila: https://stencila.io/ ; repo: https://github.com/stencila/stencila
- ScienHub: https://scienhub.com/
- Litewrite: https://github.com/HKUDS/Litewrite
- texleaf: https://github.com/ELHart05/texleaf
- Scribe: https://github.com/sunnyallana/Scribe
- ClaTeX: https://github.com/EvanLuo42/ClaTeX
- TexFlow: https://github.com/Uttam-Mahata/texflow
- Oleafly: https://github.com/Oleafly/Oleafly
- Opal / ex-Tectonic Editor: https://github.com/danylaksono/opal-editor
- CollabTeX: https://github.com/JaedenRotondo/CollabTeX
- Yjs ecosystem list (incl. ScienHub, y-webrtc, y-indexeddb): https://github.com/yjs/yjs

**Typst (primary)**
- Compiler repo (Apache-2.0, active): https://github.com/typst/typst
- typst.ts repo (Apache-2.0, active): https://github.com/Myriad-Dreamin/typst.ts
- typst.ts npm metadata (v0.7.0): https://registry.npmjs.org/@myriaddreamin/typst.ts/latest
- Web app docs (real-time, Git sync, on-prem): https://typst.app/docs/web-app/
- Git sync docs (conflict-free text merge, experimental): https://typst.app/docs/web-app/git-sync/
- Offline editing issue #459 (works only if project open; PWA on roadmap): https://github.com/typst/webapp-issues/issues/459
- Compiler-scale note (350 KB renderer / ~12 MB compiler): https://github.com/Myriad-Dreamin/typst.ts/blob/3fe6e3ca/docs/cookery/get-started.typ
- Templates: IEEE https://typst.app/universe/package/charged-ieee/ , ACM
  https://typst.app/universe/package/faithful-acmart/ , Springer Nature
  https://typst.app/universe/package/stellar-springer-nature/ , arXiv-style
  https://typst.app/universe/package/arkheion/
- Community editor example: https://github.com/Mapaor/typst-online-editor

**arXiv / publishing constraints (primary)**
- arXiv TeX submission (TeX Live 2023/2025, source required): https://info.arxiv.org/help/submit_tex.html
- arXiv accepted formats: https://info.arxiv.org/help/submit/index.html
- Typst forum: lobbying publishers (Typst source not accepted; conversion burden):
  https://forum.typst.app/t/discussion-lobbying-for-typst-adoption-by-publishers/5930
- Typst forum: Typst + arXiv state of play:
  https://forum.typst.app/t/has-typst-had-a-discussion-with-the-arxiv-maintainers/5484
- Typst forum: what arXiv would need:
  https://www.reddit.com/r/typst/comments/1rrxejo/typst_preprints_in_arxiv_what_will_it_take_typst/
- [secondary] "How to submit Typst to arXiv" (convert-and-submit): https://www.typetex.app/guides/how-to-submit-typst-to-arxiv

**Pandoc (primary)**
- pandoc-wasm repo (official Pandoc 3.9 WASM): https://github.com/pandoc/pandoc-wasm
- Browser demo: https://pandoc.github.io/pandoc-wasm/
- npm: https://www.npmjs.com/package/pandoc-wasm

---

## Unverified / caveats

- **TeXlyre's absence of a rewind / "while you were away" surface is inferred from its
  docs**, not from an explicit "we do not have this" statement or a hands-on test. It may
  exist behind a feature I did not read. Verify by running it before treating the gap as
  real. Star/fork/release figures are from the GitHub API on 2026-09-12 and will drift.
- **TeXlyre's hosted instance uptime, scale, and whether it is production or demo** were
  not verified. The docs link to it; I did not load or stress it. The "Service Status"
  page exists (https://texlyre.org/upptime) but was not checked.
- **The claim that Prism summarises co-author changes in natural language** comes from a
  third-party deep-dive, not OpenAI's product page. Treat as secondary.
- **Authorea's shutdown timeline** (migration to Wiley Research Exchange, May 2026) is
  from Wikipedia and the site notice; the underlying Wiley announcement was not fetched.
- **Typst's exact current version** was not verified — the GitHub "latest release" API
  call failed, and the 0.13/0.14 references are from forum posts and a template README.
  Do not quote a specific Typst version without checking.
- **CollabTeX, several Litewrite/ClaTeX/TexFlow-style projects, and typst online editors
  are small personal/university projects**; activity, maintenance, and correctness were
  not verified beyond repo metadata. Some may be abandoned.
- **`pandoc-wasm`** is a community wrapper around the official Pandoc WASM binary; I did
  not verify browser performance, citeproc completeness, or the quality of its LaTeX
  output on real journal templates.
- **"Local-first Overleaf is crowded"** is a judgement based on the density of projects
  found, not a market-size analysis. No user research, funding data, or usage metrics for
  these projects were gathered.
- **LaTeX WASM limits** (on-demand package downloads, no native shell/host fonts) are
  documented by TeXlyre; their practical severity on a large multi-file paper was not
  tested here.
- Star counts are a weak proxy for adoption and are included only for relative scale and
  activity signals.
