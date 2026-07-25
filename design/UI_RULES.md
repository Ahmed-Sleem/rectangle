# Rectangle UI Rules — mandatory implementation contract

**Status:** Mandatory. Every Rectangle screen, component, and feature page must comply.
**Applies to:** shell, main canvas, feature pages, AI panel, forms, tables, dialogs, empty/loading/error states.
**Supersedes:** ad-hoc values. `design/GUI_SIZING_RULES.md` remains the narrative rationale; **this file is the enforced contract**. Where the two differ, this file wins.
**Enforcement:** `apps/web/src/shell/canvas-contract.test.tsx` fails the build on violations of the token, wording, and canvas rules below.

---

## 0. The five laws

1. **No raw values.** Never write a pixel, weight, radius, or font size literal in component CSS when a token exists. If a value is missing, add a token — do not invent a one-off.
2. **Dense but calm.** Rectangle is a desktop PMO product. Default density is compact; whitespace is structural, never decorative padding.
3. **Consistency beats cleverness.** A new page must look like it shipped the same day as every other page.
4. **Touch expands, desktop compacts.** Compact desktop sizing is the default; coarse pointers get full touch targets automatically.
5. **Arabic is a first-class layout, not a translation.** Every rule here must hold in RTL.

---

## 1. Research basis

These values are not invented. They are the intersection of published guidance for information-dense enterprise UI:

| Source | What it establishes | How Rectangle applies it |
|---|---|---|
| IBM Carbon — spacing & data table | 8px base with 2px mini-steps (2/4/8/12/16/24/32/40/48); table densities 24/32/40/48/64px | Our spacing scale is identical; our default table row is 32px (Carbon "short") |
| Atlassian Design — spacing | 0–8px for compact UI, 12–24px for component padding, 32–80px for layout | Maps to `space-1..2`, `space-3..6`, `space-8..16` |
| Microsoft Fluent — Standard vs Compact | Information-rich UI needs an explicit compact mode, ~14px body | 14px body, compact 32px controls as default |
| WCAG 2.2 SC 2.5.8 (AA) | Interactive targets ≥ **24×24 CSS px** | `--rect-hit-min: 24px`; nothing interactive is smaller |
| WCAG 2.2 SC 2.5.5 (AAA) / Material 3 | 44px / 48dp for touch | `--rect-control-touch: 48px`, applied automatically at `pointer: coarse` |
| Dense-dashboard practice (Grafana/Linear/Stripe class) | 8–12px grid gaps, 12-column grid, 12–14px type, sticky headers, right-aligned numerics | Our grid gap, type scale and table rules |
| Nielsen Norman / dashboard research | 4–6 primary metrics above the fold before cognitive load degrades decisions | KPI rows are capped at 6 cards |

Deliberate deviation, documented: our left rail is **152px**, not the common 240–280px. Rectangle's rail is an icon-plus-short-label dense rail, and the brand's main canvas is the hero surface. This is intentional and must not be "corrected" to 256px.

---

## 2. Token reference — the only allowed values

Defined in `apps/web/src/shared/styles/tokens.css`. **This table is the contract.**

### 2.1 Spacing

| Token | px | Use |
|---|---:|---|
| `--rect-space-0` | 0 | flush joins only |
| `--rect-space-05` | 2 | hairline offsets, tightest label/value pairs |
| `--rect-space-1` | 4 | icon↔label gap, chip internals, field label→control |
| `--rect-space-2` | 8 | compact gaps, toolbar item gap, badge padding |
| `--rect-space-3` | 12 | compact card padding, form field stack gap, button x-padding |
| `--rect-space-4` | 16 | standard card/panel/modal padding |
| `--rect-space-5` | 20 | dense section vertical rhythm |
| `--rect-space-6` | 24 | comfortable section padding, modal backdrop inset |
| `--rect-space-8` | 32 | major group separation |
| `--rect-space-10` | 40 | major vertical break |
| `--rect-space-12` | 48 | page section separation |
| `--rect-space-16` | 64 | rare top-level grouping |

Never use 6px, 10px, 14px, 18px as spacing. Round to the scale.

### 2.2 Control heights

| Token | px | Use |
|---|---:|---|
| `--rect-hit-min` | 24 | absolute floor for any interactive target (WCAG AA) |
| `--rect-control-xs` | 24 | inline/table-row actions, small buttons |
| `--rect-control-compact` | 32 | **desktop default** — buttons, inputs, selects, toolbar controls |
| `--rect-control-standard` | 40 | primary form controls, dialog primary actions, canvas header min-height |
| `--rect-control-touch` | 48 | applied automatically under `@media (pointer: coarse)` |

### 2.3 Table rows

| Token | px | Use |
|---|---:|---|
| `--rect-table-row-ultra` | 28 | read-only reference tables |
| `--rect-table-row-dense` | 32 | **default** for all Rectangle data tables |
| `--rect-table-row-standard` | 40 | rows containing inputs or controls |
| `--rect-table-row-two-line` | 52 | primary + subtext rows |

### 2.4 Grid gaps

| Token | px | Use |
|---|---:|---|
| `--rect-grid-gap-dense` | 8 | KPI strips, tight widget grids |
| `--rect-grid-gap` | 12 | **default** feature page grid |
| `--rect-grid-gap-standard` | 16 | roomy detail layouts |

### 2.5 Typography

| Token | px | Weight | Line-height | Use |
|---|---:|---|---|---|
| `--rect-text-micro` | 11 | medium/bold | snug | eyebrows, badges, hints, uppercase labels |
| `--rect-text-label` | 12 | semibold | snug | field labels, table headers, captions |
| `--rect-text-table` | 13 | regular | snug | table body |
| `--rect-text-body` | 14 | regular/medium | body | **default** copy, inputs, list text |
| `--rect-text-subsection` | 15 | bold | tight | card/dialog titles (h3) |
| `--rect-text-section` | 17 | bold | tight | section titles (h2) |
| `--rect-text-page` | 20 | bold | tight | canvas page title (h1) |
| `--rect-text-kpi` | 28 | bold | 1.0 | headline metric numbers only |

Line-height tokens: `--rect-leading-tight` 1.15, `--rect-leading-snug` 1.3, `--rect-leading-body` 1.45.

**Never render body text below 12px.**

### 2.6 Font weights

Inter is loaded at **400 / 500 / 600 / 700 / 900 only**.

| Token | Value |
|---|---:|
| `--rect-weight-regular` | 400 |
| `--rect-weight-medium` | 500 |
| `--rect-weight-semibold` | 600 |
| `--rect-weight-bold` | 700 |
| `--rect-weight-black` | 900 (wordmark only) |

Using 550/620/650/750/850 makes the browser synthesize a weight, which renders differently across platforms and looks subtly broken. **This is enforced by a failing test.**

### 2.7 Radius

| Token | px | Use |
|---|---:|---|
| `--rect-radius-xs` | 6 | tiny chips, inline tags |
| `--rect-radius-sm` | 8 | nav items |
| `--rect-radius-md` | 10 | buttons, inputs, selects |
| `--rect-radius-lg` | 14 | cards, table wrappers, toasts |
| `--rect-radius-xl` | 18 | drawers, empty-state cards |
| `--rect-radius-2xl` | 24 | modals |
| `--rect-pill-radius` | 999 | badges, switches, circular controls |
| `--rect-panel-radius` | 28 | the main canvas rectangle (brand shape) |

### 2.8 Canvas

| Token | Value | Meaning |
|---|---|---|
| `--rect-panel-padding` | 20px 24px | canvas inner padding |
| `--rect-panel-stack-gap` | 14px | header → body gap |
| `--rect-canvas-content-max` | 1180px | max width of the feature content column |
| `--rect-canvas-scroll-fade` | 20px | scroll-edge fade depth |

---

## 3. The main canvas

The canvas is the brand surface. Its structure is owned by the shell and **feature pages must not change it**.

```
.rect-panel                 the rectangle: 28px radius, 3px border, 20/24 padding
├── .rect-panel__header     min-height 40px, 1px bottom divider, 12px pad-bottom
│   ├── .rect-panel__heading   title (+ optional eyebrow)
│   └── .rect-panel__actions   optional page-level actions
└── .rect-panel__body       the only scroll container
    └── .rect-panel__content  max 1180px, 12px gap, flex column ← feature page mounts here
```

Rules:

1. **The page title lives in the shell header. Never repeat it inside the page.**
2. The canvas title is **sentence case**. Never `text-transform: uppercase` and never positive `letter-spacing` — Arabic has no uppercase and tracking breaks Arabic letter joining.
3. `.rect-panel__body` is the **only** scroll container in the canvas. A feature page must not create a second full-page scroller.
4. Scrollbars are globally invisible. Because of that, the body carries a **state-driven mask fade**: an edge fades **only while content is actually hidden beyond it**. A page that fits on screen is never dimmed, and the bottom fade disappears once the user reaches the end.
   - Driven by `useScrollEdges` → `data-scroll-top` / `data-scroll-bottom` on `.rect-panel__body`, consumed by `--rect-fade-top` / `--rect-fade-bottom`.
   - A permanently-on fade is a **bug**, not a style: it dims real content and lies about whether more exists.
   - Any new scroll region you introduce must provide an equivalent affordance (state-driven fade, sticky footer, or explicit "show more"). Reuse `useScrollEdges` rather than reimplementing it.
5. Feature pages never set their own `max-width` or outer margins — the content column already does it.
6. The canvas must never be given `overflow: hidden` in a way that clips the AI launcher or nav orb.

---

## 4. Components

### 4.1 Buttons

| Size | Height | X-padding | Radius | Use |
|---|---:|---:|---:|---|
| `sm` | 24px | 8px | 10px | inside table rows, inline actions |
| `md` | 32px | 12px | 10px | **default** — toolbars, forms, dialogs |
| `lg` | 40px | 16px | 10px | primary submit, auth screens |

- Gap between icon and label: `--rect-space-2`.
- Weight: `--rect-weight-semibold`. Never bold-black.
- Variants: `primary` (solid ink), `secondary` (card surface + border), `ghost` (transparent), `danger` (solid red). Exactly one `primary` per view region.
- Press feedback: `scale(0.97)`. Hover: surface/border shift only, never size change.
- Disabled: `opacity 0.55` + `not-allowed`. Never hide a disabled reason — put it in a hint or tooltip.
- Under `pointer: coarse`, `sm`/`md`/`lg` all become 48px automatically. Do not fight this.

### 4.2 Icon buttons

Sizes 24 / 32 / 40px (`xs`/`compact`/`standard`), always circular, always with an accessible `aria-label` and matching `title`. Icon glyph stays 16–18px inside the larger hit area.

### 4.3 Inputs, selects, textareas

- Height 32px compact (default) / 40px standard forms; radius 10px; x-padding 12px; font 14px.
- Textarea min-height 88px, padding 8px 12px, `resize: vertical` only.
- Field structure: label (12px semibold) → control → hint **or** error (11px). Gap `--rect-space-1`.
- Errors: red border + red message + `aria-invalid`. Never colour-only.
- Placeholders are hints, never labels. Every control has a real label.

### 4.4 Checkbox / switch

Visual box 16–18px, but the label row is 32px min-height so the target clears WCAG. Switch track 36×20 with a 16px thumb.

### 4.5 Cards

| Kind | Padding | Radius |
|---|---:|---:|
| Dense metric card | 12px | 14px |
| Standard card | 16px | 14px |
| Empty-state card | 24px | 18px |

1px soft border, card background. Do not nest a bordered card inside a bordered card — use a divider instead.

### 4.6 Tables

- Default row **32px**, header row **32px**, sticky header, 12px cell x-padding.
- Body 13px; header 12px semibold, secondary colour.
- Text left (start), **numbers right (end) with tabular numerals**, status badges centred.
- Row hover: subtle neutral fill. No zebra striping unless it measurably helps.
- Wrapper has 1px border + 14px radius and owns the horizontal scroll.
- Empty tables render a centred, user-facing message row — never a blank body.
- Under `pointer: coarse`, rows expand to 48px automatically.

### 4.7 Badges

22px min-height, 11px bold, pill radius, 8px x-padding. Tones carry **meaning only**: `success` complete/healthy, `warning` at risk, `danger` late/critical, `info` neutral system, `accent` category. Never decorative colour.

### 4.8 Modals and drawers

- Modal: max-width 480px, `max-height: min(100%, 720px)`, radius 24px, flex column.
- Header 48px min-height with the close control; body scrolls internally with `overscroll-behavior: contain`; actions right-aligned with 16px top margin.
- Backdrop inset 24px so the dialog never touches the viewport edge.
- **A dialog must never be full-height by default and must never clip its action row.**
- Drawer: 280–360px wide, radius 18px, same header/body contract.

### 4.9 Empty, loading, error, permission states

Four states are mandatory for every data surface:

| State | Requirement |
|---|---|
| Loading | Spinner or skeleton matching the final layout's dimensions. Never a layout jump. |
| Empty | User-facing sentence + the primary action if the user is allowed to take it. |
| Error | What failed in plain language + a retry affordance. Never a raw error code or stack. |
| No permission | A clean explanation, or hide the surface entirely. Never a broken/disabled shell. |

---

## 5. Wording rules (user-visible text)

**Banned in any user-visible string** — enforced by test:

`not implemented` · `ui shell` · `no fake data` · `backend pending` · `audit pending` · `validation contract` · `coming soon` · `todo` · `tbd`

Also never render internal identifiers (feature ids, route keys, table names, error codes) to end users.

If a workflow is not genuinely usable: **hide the action**, or show a clean permission/empty state. Never ship a control that lies about what it does.

Every visible sentence must help the user finish a task. Write for a construction PM, not for a developer.

---

## 6. Arabic / RTL

1. Use **logical** CSS properties: `padding-inline`, `margin-inline-start`, `inset-inline-end`, `text-align: start/end`. Never `left`/`right` for content flow.
2. Never `text-transform: uppercase` on text that can be Arabic.
3. Never positive `letter-spacing` on Arabic — it breaks letter joining.
4. Icons that imply direction (back, next, collapse arrows) must mirror in RTL. Icons that do not imply direction (search, settings, calendar) must **not** mirror.
5. Numbers, dates, currency and durations stay LTR inside RTL text.
6. Every new page is reviewed in Arabic before it is called done.

---

## 7. Motion

| Motion | Duration | Easing |
|---|---:|---|
| Hover / colour | 120–180ms | ease |
| Press | ≤120ms | ease-out |
| Nav & AI panel collapse | 280–350ms | `cubic-bezier(0.4, 0, 0.2, 1)` |
| Panel entrance | ~260ms | ease-out |

- Never animate data. Tables, values and rows appear instantly.
- No decorative wordmark animation.
- Every animation and transition must be disabled under `prefers-reduced-motion: reduce`.

---

## 8. Layout & responsiveness

12-column grid inside the content column. Allowed spans: 3, 4, 6, 8, 12.

| Breakpoint | Behaviour |
|---|---|
| ≥1280px | Full shell: rail + canvas + AI panel |
| 1100–1279px | AI panel narrows to 320px |
| 769–1099px | Three zones retained; AI panel may collapse to the launcher |
| ≤768px | Stacked; canvas padding drops to 16px, radius to 20px |
| `pointer: coarse` | All controls expand to 48px |

Standard patterns: KPI row (4×3 or 3×4 columns, max 6 cards) · master/detail (8 + 4) · table-first (12) · document preview (3 + 9).

---

## 9. Colour

Shell stays soft monochrome — near-black chrome, off-white surface, zinc text. Never pure `#000`/`#fff`.

Semantic colour is permitted **only** to communicate state: red critical/late, amber at-risk, green healthy/complete, blue informational, indigo accent/selection. No decorative or rainbow palettes. All colour must come from `--rect-color-*` / semantic tokens, never a literal hex in component CSS.

Text contrast must meet WCAG AA (4.5:1 body, 3:1 large text and UI boundaries).

---

## 10. Accessibility floor

- Every interactive element ≥ 24×24px, keyboard reachable, with a visible focus ring (`:focus-visible`, 2px, 2px offset).
- Icon-only controls always have an accessible name.
- Headings are hierarchical: canvas title is the only `h1`; sections use `h2`; cards use `h3`.
- Dialogs use `role="dialog"` + `aria-modal` + a label, and return focus on close.
- Live regions (`role="status"`) for async results.
- Never communicate state by colour alone — pair it with text or an icon.

---

## 11. Definition of done for any UI work

- [ ] Every spacing, size, radius, weight and font-size comes from a token in §2.
- [ ] The page mounts inside `.rect-panel__content` and adds no outer width or margin.
- [ ] The page title is not duplicated inside the content area.
- [ ] Loading, empty, error and no-permission states all exist and are user-facing.
- [ ] No banned wording (§5) and no internal identifiers are visible.
- [ ] Reviewed in Arabic/RTL; logical properties used throughout.
- [ ] Smallest interactive target ≥ 24px; verified at `pointer: coarse`.
- [ ] Keyboard path and focus ring verified.
- [ ] No second full-page scroll container; any new scroll region has an overflow affordance.
- [ ] Dialogs fit the screen and never clip their actions.
- [ ] Semantic colour carries meaning only.
- [ ] `./scripts/verify.sh` passes, including `canvas-contract.test.tsx`.
