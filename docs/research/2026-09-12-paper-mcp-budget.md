# Paper MCP budget: how the limit works and how to work within it

Researched without spending a single Paper MCP request. All findings are from local config/app
inspection plus public Paper pages. Every claim below is either cited or explicitly flagged as
derived/unverified.

---

## 0. TL;DR

- The 100/week cap is **enforced by Paper's cloud**, not locally. The desktop app is a
  **pure proxy** with no quota code.
- A request is counted when a tool is wrapped in `gatedMCPToolCall`. **31 of the 34 tools cost 1
  each; 3 tools are free** (`get_basic_info`, `get_guide`, `finish_working_on_nodes`).
- Nearly every read tool is gated too, so "just exploring" is what burns budget.
- The cheapest legitimate fix is **batching and free tools**, not a bypass. Free plan is
  100/week; Pro is 1M/week for ~$16–20/editor/mo.
- ~69 requests is plenty for 10 screens if you do local HTML authoring and push with a handful of
  `write_html` calls.

---

## 1. Local setup (verified)

**Config** — `~/.config/opencode/opencode.json`:

```json
"mcp": {
  "servers": {
    "paper": {
      "type": "remote",
      "url": "http://127.0.0.1:29979/mcp"
    }
  }
}
```

**Transport**: Streamable HTTP on loopback, not stdio. The listener is the **Paper Desktop
app** (`paper-desktop`, pid from `/var/home/sid/AppImages/paper.appimage`, mounted at
`/tmp/.mount_paper.qxJgT3`), confirmed with `ss -tlnp` / `lsof`.

**Implementation**: the app's bundled `resources/app.asar` contains the source and bundle:
`src/mcp/server.ts`, `src/mcp/bridge.ts`, `src/mcp/index.ts`, built to `dist/main.cjs`
(package `@paper/desktop` v0.5.8, Hono + `@modelcontextprotocol/sdk` + `@hono/mcp`).

**Key structural finding**: the MCP server is a thin proxy. `server.ts` registers the
`CallTool` handler and forwards every call to the renderer:

```ts
return await bridge.call('handleToolCall', sessionId, name, args ?? {}, ...)
```

`bridge.ts` runs `window.resolveMCPHandlers` inside the Paper web renderer
(`https://app.paper.design`) via Electron `executeJavaScript`. So the tool definitions, the tool
implementations, and the usage gate all live in the **remote web client**, not in the local
binary.

**No local enforcement.** Searching `src/`, `dist/main.cjs` for `limit`, `quota`, `rate`,
`request`, `100`, `week`, `credit` found only PostHog SDK internals and unrelated UI copy. There
is no `mcpLimit`, weekly counter, or rate limiter in the desktop code. Conclusion: **the limit
is server-side (cloud)**, surfaced to the client as a meter balance.

---

## 2. How the limit is actually enforced (verified from the web client bundle)

The quota logic is in the lazily-loaded client chunk
`https://app.paper.design/assets/MCPHandlers-DTgBKJv6.js` (hash may change over time; mirror of
the same code sits in `main-D-tkVXh4.js`).

Every tool call goes through `gatedMCPToolCall(tool, meta)`:

```js
if (this.root.meterState.mcpRemaining > 0)
  return this.root.meterState.recordMcp(), tool();
// else throw:
"Weekly MCP limit reached. It resets ${resetDate}. Upgrade to Paper Pro to continue…"
```

Balance is fetched from the Paper cloud:

- `GET  https://workers.paper.design/meter/balance` → `{ mcpCap, mcpUsed, manaCap, manaUsed,
  serverClock, meterScope }`
- `POST https://workers.paper.design/meter/record-mcp` on every gated call (optimistic local
  decrement first, then server-confirmed `{cap, used, serverClock}`).

**What counts**: exactly one request per **gated** tool invocation — regardless of how many
nodes the call touches. Batching many nodes into `update_styles`/`set_text_content`/
`write_html` still costs **1**.

**What is free**: tools whose handler is *not* wrapped in `gatedMCPToolCall`. There are exactly
three:
`get_basic_info`, `get_guide`, `finish_working_on_nodes`.

**Counting happens before the work.** `recordMcp()` is called before the tool executes, so a
call that later fails validation (bad node id, HTML parse error) still spends a request. Avoid
speculative calls.

**Reset cadence**: derived from client code, not documented publicly. The client computes the
current week start as the most recent **Saturday 00:00 UTC**:

```js
const r = new Date, s = (r.getUTCDay() + 1) % 7;
const weekStart = Date.UTC(r.getUTCFullYear(), r.getUTCMonth(), r.getUTCDate() - s);
```

and refetches balance when the server clock predates that. Treat "resets weekly around Saturday
00:00 UTC" as *derived, high-confidence but not officially documented*. The Paper docs only
acknowledge that an upgrade refresh bug existed ("After upgrading MCP limits aren't reset").

**Plan caps** (official, from the pricing page):
- Free: **100/week MCP tool calls**
- Pro: **1M/week MCP tool calls**

`meterScope` is `team` for editors or `user` for free "Viewer" seats; the error message differs
per scope ("Weekly Viewer MCP limit reached" vs "Weekly MCP limit reached").

---

## 3. Full tool list, cost, and where the cost is

All gated tools = **1 request**. Free tools = **0**. Note: the same public docs page lists only a
subset; the client actually exposes 34 tools.

| # | Tool | Cost | Notes |
|---|------|------|-------|
| 1 | `get_basic_info` | **0 (free)** | Use this first, freely. File/page/artboards/tokens. |
| 2 | `get_guide` | **0 (free)** | Topics found: `paper-mcp-instructions`, `figma-import`, `image-generation`, `mobile-status-bar`. Read these for free. |
| 3 | `finish_working_on_nodes` | **0 (free)** | Required cleanup. Free. |
| 4 | `get_selection` | 1 | |
| 5 | `get_node_info` | 1 | Per-node; expensive in *count*, not payload. |
| 6 | `get_children` | 1 | Per-node. |
| 7 | `get_tree_summary` | 1 | Cheapest orientation read (1 for whole subtree). |
| 8 | `get_screenshot` | 1 | Large base64 payload; auto-capped. |
| 9 | `get_jsx` | 1 | Large payload (Tailwind or inline). |
| 10 | `get_computed_styles` | 1 | **Batch**: many nodes, one call. |
| 11 | `get_fill_image` | 1 | Large base64 JPEG. |
| 12 | `find_nodes` | 1 | Style/text search; scopes whole page. |
| 13 | `get_font_family_info` | 1 | |
| 14 | `open_file` | 1 | App scope; sets sticky session. |
| 15 | `list_files` | 1 | App scope, up to 200. |
| 16 | `create_file` | 1 | Creates a new file. |
| 17 | `create_page` | 1 | New page; does not switch to it. |
| 18 | `write_html` | 1 | **Arbitrary HTML tree**; see §5. |
| 19 | `create_artboard` | 1 | One artboard per call. |
| 20 | `update_styles` | 1 | **Batch**; tokens supported. |
| 21 | `set_text_content` | 1 | **Batch**; Text nodes only. |
| 22 | `rename_nodes` | 1 | **Batch.** |
| 23 | `duplicate_nodes` | 1 | Deep clone; returns `descendantIdMap`. |
| 24 | `move_nodes` | 1 | **Batch** moves. |
| 25 | `delete_nodes` | 1 | **Batch** (cascades). |
| 26 | `export` | 1 | Writes PNG/JPG/SVG/PDF/MP4/WebM locally. |
| 27 | `export_combined_pdf` | 1 | Multi-node → one PDF. |
| 28 | `get_tokens` | 1 | |
| 29 | `create_tokens` | 1 | **Batch.** |
| 30 | `set_tokens` | 1 | **Batch.** |
| 31 | `list_comment_threads` | 1 | |
| 32 | `get_comment_thread` | 1 | |
| 33 | `list_comment_thread_authors` | 1 | |
| 34 | `set_comment_thread_status` | 1 | |

Docs reference: <https://paper.design/docs/mcp>

"Expensive" in request terms = anything called repeatedly, especially per-node reads
(`get_node_info`, `get_children`, `get_screenshot`) and one-`write_html`-per-row habits.
`get_computed_styles`, `update_styles`, `set_text_content`, `rename_nodes`, `move_nodes`,
`delete_nodes` are all batch tools and are the budget workhorses.

---

## 4. Batching / bulk / import (verified)

- **`write_html` takes a whole HTML string** (`{html, targetNodeId, mode}` with
  `insert-children` or `replace`). It parses the HTML to a node tree and inserts **all**
  top-level nodes in one call (`Tt(h, {editorState, parentId})`). The `replace` mode can also
  replace one node with a multi-node fragment. There is no separate bulk/import MCP tool.
- **A complete multi-screen document can be pushed in one request**: target the page root with
  `insert-children` and include N top-level frame elements in the HTML. Each becomes a frame
  (artboard) in one `write_html` call.
- **No hard per-call node cap was found** in the parser. The only stated limit is human-facing:
  the tool description says *"Write incrementally… Each write_html call should create one visual
  item…"*. That is a UX recommendation (show progress on canvas), not an enforced cap. Batching
  is allowed.
- **`x-paper-clone node-id="…"`** inside the HTML clones existing Paper nodes, so repeated
  components don't need to be re-expressed.
- **Import outside MCP**: the app supports **clipboard HTML import** — a paste handler reads
  `text/html` and converts it through the same `code-import` converter; Figma copy/paste is
  officially supported (<https://paper.design/docs/paste/figma>); "Paper Snapshot" copies a
  website section in as editable layers. This is a UI path, not an MCP tool.
- **No plugin/scripting API** was found for Paper. No public bulk-import endpoint.

---

## 5. The three ways to spend less (legitimate), ranked

1. **Use the 3 free tools for all orientation.** `get_basic_info` before anything, `get_guide`
   for workflows, `finish_working_on_nodes` at the end. Cost: **0**. Eliminates the classic
   "burn 10 calls figuring out what's there."
2. **Batch aggressively.** One `write_html` for many frames; one `update_styles` for many nodes;
   one `set_text_content` for all copy; one `rename_nodes`. Cost: **1 per class of change**,
   not per item. A 10-screen doc realistically needs 1–3 writes.
3. **Reuse instead of remake.** `duplicate_nodes` (1 call, returns `descendantIdMap`) or
   `<x-paper-clone>` inside `write_html` to stamp repeated screens/components. One call can
   clone an entire screen.
4. **Local-first authoring.** Build and preview all HTML in the repo / a local browser; only
   push to Paper when it's right. Every local iteration is free; every Paper round-trip is not.
5. **One orientation read, not many.** `get_tree_summary` (1) replaces a pile of
   `get_node_info`/`get_children` calls. `get_basic_info` is already free.
6. **Few, deliberate verification reads.** Prefer one `get_screenshot` of a parent/page over
   per-screen screenshots; use `get_basic_info` (free) to confirm artboards exist.
7. **Wait for the reset** if you're near the cap. Cost: 0.
8. **Upgrade to Pro** if sustained MCP use is the workflow. **1M/week** for ~$16–20/editor/mo —
   the intended, sanctioned way to get more budget. <https://paper.design/pricing>

**Estimated cost for 10 screens: ~15–30 gated requests** (e.g. 1–3 `write_html`, ~5–10 batched
refinements, ~3–5 screenshots, ~1 `get_tree_summary`, plus free calls). Well inside ~69.

---

## 6. Bypass options and their honest risk profile

| Option | Works? | Risk / ToS |
|---|---|---|
| **Pro upgrade** | Yes | None. Official. **Recommended.** |
| **Wait for weekly reset** | Yes | None. |
| **Free tools only for reads** | Yes | None — it's just the metering behaviour. |
| **Paste HTML into the canvas manually** (clipboard import / Figma paste) | Yes | Legitimate product use; no MCP calls. Costs human time and is not agent-drivable. GUI automation (xdotool/ydotool) to paste would be fragile and not officially supported. Not billing circumvention, but not a stable pipeline either. |
| **Multiple accounts / free teams to farm 100/week** | Technically possible | **Explicitly prohibited.** ToS: *"You shall not have more than one Account at any given time"* and no re-registering after termination. Risk: account termination, data loss, no refund. **Do not do this.** |
| **Patch `app.asar` / the client bundle to fake `mcpRemaining` or skip `recordMcp`** | Partly | Violates the ToS prohibition on modifying/reverse-engineering/decompiling the Service. The server still receives/derives usage on `record-mcp` and `/meter/balance`, and can reject or flag the account. Reliability: breaks on every app update. **Not advisable / likely ban.** |
| **Call `workers.paper.design/meter/*` directly or read local cloud cache to avoid MCP** | Unverified | Reading your own cached data is arguably fine, but automating Paper's endpoints is ToS-adjacent (anti-scraping clause) and undocumented. Treat as unsupported, brittle. **Not recommended.** |

Bottom line: there is **no legitimate way to exceed the cap other than paying for Pro or waiting
for the reset**. Anything that fakes the meter, multiplies accounts, or patches the client is
billing circumvention, prohibited by the ToS, and risks losing the account and the design files.
The honest budget strategy is free tools + batching + local-first authoring.

---

## 7. Recommended working method for ~10 screens in ~69 requests

**Phase 0 — free recon (0 requests)**
1. `get_basic_info` (free) to confirm file, page, existing artboards.
2. `get_guide({topic:"paper-mcp-instructions"})` (free), and `image-generation` / `figma-import`
   only if relevant.

**Phase 1 — author locally (0 requests)**
3. Write all 10 screens as one HTML document (or 2–3 grouped documents) in the repo. Preview in
   a local browser. Iterate until it matches. Do not use Paper for iteration.
4. Prepare the exact HTML you will insert, including any `<x-paper-clone>` reuse and CSS tokens.

**Phase 2 — push (1–3 requests)**
5. `write_html` with `mode:"insert-children"` targeting the page root, containing the 10 frames.
   If you're not confident it parses, split into 2–3 calls (e.g. 3–4 screens each) so one bad
   fragment doesn't cost a full redo. Each call is still just 1 request.

**Phase 3 — verify and refine (~8–15 requests)**
6. `get_tree_summary` or one `get_screenshot` of the page (1–2 requests) to confirm structure.
7. Apply all fixes as batched calls: one `update_styles` for every style correction, one
   `set_text_content` for all copy, one `rename_nodes` for all labels, one `duplicate_nodes` to
   stamp a repeated screen. Aim for ≤10 refinement calls.
8. `finish_working_on_nodes` (free).

**Budget math**: Phase 2 (≤3) + Phase 3 (≤15) ≈ **≤18 gated requests**, leaving ~50 in reserve.
If a screen needs a dedicated screenshot, add 1 each — still comfortable. Avoid per-node
`get_node_info`/`get_children` entirely; use the free `get_basic_info` and a single
`get_tree_summary`.

If budget runs low: stop verifying per screen, rely on local previews, and push the rest with
batched `write_html`/`update_styles`.

---

## Sources

- Local: `~/.config/opencode/opencode.json`; Paper Desktop `resources/app.asar`
  (`src/mcp/server.ts`, `src/mcp/bridge.ts`, `dist/main.cjs`).
- Web client bundle: `https://app.paper.design/assets/MCPHandlers-DTgBKJv6.js` and
  `https://app.paper.design/assets/main-D-tkVXh4.js` (quota gate, `meter/balance`,
  `meter/record-mcp`, free vs gated handlers, tool descriptions, week-start logic).
- Paper pricing (100/week free, 1M/week Pro): <https://paper.design/pricing>
- Paper MCP docs (setup, public tool list, upgrade-refresh note):
  <https://paper.design/docs/mcp>
- Figma paste import: <https://paper.design/docs/paste/figma>
- Terms of Service (one account; no reverse engineering/modification; no scraping):
  <https://paper.design/legal/tos>

**Unverified / caveats**
- The Saturday-00:00-UTC weekly reset is *derived from client code*; Paper publishes no reset
  schedule. Verify against the in-app meter before relying on it.
- The public tool list omits ~13 tools (comments, tokens, `find_nodes`, `open_file`,
  `list_files`, `create_file`, `create_page`, `export_combined_pdf`, etc.). The gated/free split
  above is read from the current client bundle and could change when Paper ships an update.
- Whether the agent harness counts free tools against its own 100/week tally is unknown. Paper's
  meter does not bill them; if your budget is a self-imposed call count, the free tools still
  "count" on paper (pun intended) — check the meter to confirm.
