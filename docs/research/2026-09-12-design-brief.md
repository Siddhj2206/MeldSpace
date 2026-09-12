# Design brief — "The Quiet Room"

Date: 2026-09-12.

Source of truth: **Paper file "MeldSpace — Room Shell"** — https://app.paper.design/file/01M2AE77EFA2H4CMS3P5EB5BBE
Artboards: `Room shell — editor`, `Room shell — board`, `Room — remaining screens`.

## Mood

**Vehicle dashboard — instrument black × amber LED.** MeldSpace is a quiet instrument: in a dark cabin you want exactly one amber lamp telling you the machine is alive. Chosen over the first instinct (terminal/phosphor) because it gives the product a warm human center instead of generic blue-on-charcoal.

## Palette

Derived from that scene:

| Role | Value |
|---|---|
| App ground | `#0B0C0D` instrument black |
| Surface 1 / 2 | `#121316` / `#191B1E` |
| Text (bone) | `#ECEDEA` |
| Secondary / tertiary text | `#8B9096` / `#5C6167` |
| Hairline / strong hairline | `rgba(255,255,255,0.09)` / `rgba(255,255,255,0.16)` |
| Primary button | bone `#ECEDEA` on `#0B0C0D` |
| **Signal (reserved)** | `#E0A23C` amber — focus ring, active nav/tool, live or reconnecting state only |
| Success / danger | `#5FBF8A` / `#E0564B` |
| Identity roster (people only) | coral `#E0645C`, ochre `#D98A3A`, moss `#7FB46B`, teal `#4FB3A5`, blue `#5C8FE0`, violet `#9B7BE0`, pink `#D472B0`, gold `#C9A23C` |

Rule: the amber signal and the identity roster never cross. People get color; chrome does not.

## Type

Inter (sans) + JetBrains Mono (labels/status, uppercase with open tracking).
Sizes: 11 eyebrow · 12 micro · 13 body-sm · **15 body** · 17/20/24 titles. Weights 400/500/600 only. Tracking tight on large type, open on eyebrows.

## Direction

*Quiet instrument.* Near-black cabin, hairline-separated flat surfaces, one amber lamp of state. The distributed machinery — peers, epochs, queued changes — lives behind a single status glyph until you ask for it. All color belongs to people, not chrome.

## Shell IA

- **Left (shadcn `Sidebar`)**: room switcher; artifacts grouped by type (Documents / Files / Boards / Comments) with a presence dot per artifact; quiet status footer (sync glyph + peer stack + account with coordinator ring and `COORD · R3`).
- **Main**: tab strip of open artifacts, presence avatars, neutral bone Share button; the active surface below.
- **Right rail**: on demand (Details / People / History), not persistent.
- **Command palette** on ⌘K; sidebar toggle on ⌘B.
- **Very quiet by default**: no bottom status bar, no banners, no persistent right rail.

## Copy / terms

- Say **coordinator**, never owner/admin, and show it as a round (`COORD · R3`).
- Say **converged**, not synced, for the quiet status.

## Implementation notes

- shadcn **Base UI** flavor (`base-lyra`): compose with `render={<Link/>}`, never `asChild`.
- Primitives to add from `apps/web`: sidebar, tabs, resizable, scroll-area, command, dialog, avatar, badge, breadcrumb, input-otp, kbd, spinner, item, popover, hover-card.
- `packages/ui` already ships dropdown-menu, empty, skeleton, tooltip, input-group, sonner.
- Board tab embeds Excalidraw in dark mode, chrome restyled to these tokens.
