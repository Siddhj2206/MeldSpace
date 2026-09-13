# Design exports

A frozen, local snapshot of the Paper file **"MeldSpace — Room Shell"**, so implementation agents
never need to spend Paper MCP requests just to read the design.

- Source: <https://app.paper.design/file/01M2AE77EFA2H4CMS3P5EB5BBE>
- Exported: 2026-09-12, with Paper's `get_jsx` (format `tailwind`)
- Token hash: `ad523f07`
- Design brief: [`docs/research/2026-09-12-design-brief.md`](../research/2026-09-12-design-brief.md)

## Files

| File | Artboard | Node | Size |
| --- | --- | --- | --- |
| `exports/room-shell-editor.jsx` | Room shell — editor | `1-0` | ~21 KB |
| `exports/room-shell-board.jsx` | Room shell — board | `4J-0` | ~32 KB |
| `exports/room-remaining-screens.jsx` | Room — remaining screens | `BF-0` | ~158 KB (10 frames) |
| `exports/tokens.css` | design tokens | — | 40 tokens |

## How to use these

- **These files are the design ground truth. Read them; do not call Paper MCP to read the
  design.** Paper reads are metered and the budget is small.
- The exports are Paper JSX: a single React-shaped expression using Tailwind classes and
  `var(--token)` references. Treat them as a **spec** for structure, spacing, type and color, not
  as runnable components. Paper emits arbitrary values (`w-66`, `text-body/6.75`) that only resolve
  inside Paper — map them onto the app's Tailwind v4 theme and the `packages/ui` primitives.
- The app's authoritative token definitions live in `packages/ui/src/styles/globals.css`;
  `exports/tokens.css` mirrors the design file. Keep the two in sync.

### Frame map — `room-remaining-screens.jsx`

| # | Screen | Ticket | Lines in this snapshot |
| --- | --- | --- | --- |
| 1 | Auth — sign in | #17 | 3–133 |
| 2 | Auth — create account | #17 | 134–264 |
| 3 | Create room | #17 | 265–464 |
| 4 | Join room (code + QR) | #17 | 465–821 |
| 5 | Share dialog | #15 | 822–1187 |
| 6 | History — checkpoint timeline | #7 | 1188–1454 |
| 7 | Rewind confirm | #7 | 1455–1659 |
| 8 | Image / file surface | #9 | 1660–1940 |
| 9 | Command palette (⌘K) | #15 | 1941–2268 |
| 10 | Offline / reconnecting + status | #15, #5 | 2269–end |

Line numbers are for this committed snapshot and drift on re-export — search for the screen's
heading text instead. The two shells are in `room-shell-editor.jsx` (#15, #2) and
`room-shell-board.jsx` (#11).

## Re-exporting (only when the design changes)

`scripts/paper-mcp-export.py` talks to the local Paper Desktop MCP server directly and writes the
payload straight to a file, so large exports never pass through an agent's context.

```sh
python3 scripts/paper-mcp-export.py list
python3 scripts/paper-mcp-export.py export <nodeId> docs/design/exports/<name>.jsx
```

Requires Paper Desktop running with the file open. Node IDs come from `get_basic_info` (free).

## Paper MCP budget rules

Full account: [`docs/research/2026-09-12-paper-mcp-budget.md`](../research/2026-09-12-paper-mcp-budget.md).

- Almost every tool is gated at **1 request per call**, counted *before* execution — a call that
  fails still costs. The free tools are exactly `get_basic_info`, `get_guide`,
  `finish_working_on_nodes`.
- **Batch by class of change**: one `get_jsx`, `write_html`, `update_styles` or `set_text_content`
  per artboard, never per node or per screen.
- **Re-export only the changed artboard** (1 request). Never re-export the whole file.
- Never use per-node `get_node_info` / `get_children`; one `get_tree_summary` (1) replaces a pile.
- Free plan is 100 requests/week, resetting around Saturday 00:00 UTC.
