# Rectangle UI Rules — mandatory implementation contract

**Status:** Mandatory. Every Rectangle screen, component, and feature page must comply.
**Applies to:** shell, main canvas, feature pages, AI panel, forms, tables, dialogs, empty/loading/error states.
**Supersedes:** ad-hoc values. `design/GUI_SIZING_RULES.md` remains the narrative rationale; **this file is the enforced contract**. Where the two differ, this file wins.
**Enforcement:** `apps/web/src/shell/canvas-contract.test.tsx` fails the build on violations of the token, wording, and canvas rules below.

---

## 0. The six laws

1. **No raw values.** Never write a pixel, weight, radius, or font size literal in component CSS when a token exists. If a value is missing, add a token — do not invent a one-off.
2. **Dense but calm.** Rectangle is a desktop PMO product. Default density is compact; whitespace is structural, never decorative padding.
3. **Consistency beats cleverness.** A new page must look like it shipped the same day as every other page.
4. **Touch expands, desktop compacts.** Compact desktop sizing is the default; coarse pointers get full touch targets automatically.
5. **Arabic is a first-class layout, not a translation.** Every rule here must hold in RTL.
6. **Compose from shared blocks; never re-implement one.** If two screens need the same thing,
   it belongs in `@/shared/ui`. Copy-pasted UI is how a product stops looking like one product.

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

**Nested containers must not repeat the same gap.** Spacing compounds: a 16px section gap
inside a 16px form gap inside a 16px row gap reads as one enormous gap, not as structure.
Step the scale down as you nest, so hierarchy comes from *contrast* between levels:

| Nesting level | Gap | Meaning |
|---|---:|---|
| Between sections | `space-3` (12) | Separate topics |
| Between rows in a section | `space-3` (12) | Separate settings |
| Between a label block and its controls | `space-2` (8) | One unit |
| Between fields in a grid | `space-2` row / `space-3` column | Peers |
| Between a label and its own control | `space-1` (4) | Inseparable |

Rule of thumb: **each level inward is one step smaller, never equal or larger.** If a block
feels airy, count the nested gaps before adding anything new — the fix is almost always
removing a duplicated gap, not adding a divider.

### 2.2 Control heights

| Token | px | Use |
|---|---:|---|
| `--rect-hit-min` | 24 | absolute floor for any interactive target (WCAG AA) |
| `--rect-control-xs` | 24 | inline/table-row actions, small buttons |
| `--rect-control-compact` | 32 | **desktop default** — buttons, inputs, selects, toolbar controls |
| `--rect-control-standard` | 40 | primary form controls, dialog primary actions, canvas header min-height |
| `--rect-control-touch` | 48 | applied automatically under `@media (pointer: coarse)` |

### 2.3 Control widths

A control's width is a usability cue: it tells the user how much input is
expected. Stretching every field to fill its row throws that cue away and makes a
two-word status look like a long answer.

| Token | px | Use |
|---|---:|---|
| `--rect-field-width-xs` | 96 | Codes, quantities, currency codes |
| `--rect-field-width-sm` | 140 | Short pickers, e.g. a status filter |
| `--rect-field-width-md` | 176 | **Default filter width.** Fits ~18 characters |
| `--rect-field-width-lg` | 240 | Longer pickers and compact text inputs |
| `--rect-field-width-search` | 320 | Search fields at rest |
| `--rect-field-width-search-focus` | 400 | Search field while in use |

Rules:

1. **Match the width to the expected input length.** Mismatched widths cause
   measurable hesitation — users pause, re-read the label, and sometimes type and
   delete extra characters.
2. **Cap, do not stretch.** Set a max width instead of letting a control grow with
   the viewport. A 1500px text field makes long entries hard to track.
3. Form fields inside a `Field` may fill their grid cell; **toolbar controls may not.**
4. Below 640px controls may fill, because a stacked layout no longer carries a
   width cue to lose.

### 2.4 Engaged state

A control that is focused, open, or selected takes the chrome's own near-black
border rather than a lighter grey.

| Token | Value | Use |
|---|---|---|
| `--rect-border-active` | `--rect-color-ink-strong` | Every focused, open, or selected boundary |

Rules:

1. **Darken the existing border; never add a second one.** An extra ring changes
   the element's size and gets clipped by its container.
2. **One token for every engaged surface** — focused inputs, open sections,
   emphasised cards, hovered rows — so a theme change moves them together.
3. This is an accessibility requirement, not a preference. WCAG 1.4.11 asks for
   3:1 on a UI boundary; the light grey previously used measured **2.17:1** against
   the card surface and failed. The near-black measures **15:1**.

### 2.5 Table rows

| Token | px | Use |
|---|---:|---|
| `--rect-table-row-ultra` | 28 | read-only reference tables |
| `--rect-table-row-dense` | 32 | **default** for all Rectangle data tables |
| `--rect-table-row-standard` | 40 | rows containing inputs or controls |
| `--rect-table-row-two-line` | 52 | primary + subtext rows |

### 2.6 Grid gaps

| Token | px | Use |
|---|---:|---|
| `--rect-grid-gap-dense` | 8 | KPI strips, tight widget grids |
| `--rect-grid-gap` | 12 | **default** feature page grid |
| `--rect-grid-gap-standard` | 16 | roomy detail layouts |

### 2.7 Typography

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

Brand/display sizes, deliberately off the content scale because they are identity surfaces rather than page content:

| Token | px | Use |
|---|---:|---|
| `--rect-text-display` | 25 | auth/setup headline |
| `--rect-text-wordmark` | 22 | collapsed rail wordmark |
| `--rect-text-wordmark-lg` | 28 | expanded rail wordmark |

**No raw `font-size` value may appear in any component CSS.** Every size resolves to a token — enforced by a failing test.

Line-height tokens: `--rect-leading-tight` 1.15, `--rect-leading-snug` 1.3, `--rect-leading-body` 1.45.

**Never render body text below 12px.**

### 2.8 Font weights

Inter is loaded at **400 / 500 / 600 / 700 / 900 only**.

| Token | Value |
|---|---:|
| `--rect-weight-regular` | 400 |
| `--rect-weight-medium` | 500 |
| `--rect-weight-semibold` | 600 |
| `--rect-weight-bold` | 700 |
| `--rect-weight-black` | 900 (wordmark only) |

Using 550/620/650/750/850 makes the browser synthesize a weight, which renders differently across platforms and looks subtly broken. **This is enforced by a failing test.**

### 2.9 Radius

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

### 2.10 Overlay / window tokens

| Token | Value | Use |
|---|---|---|
| `--rect-overlay-width-sm/md/lg/xl` | 420 / 560 / 760 / 960px | Window width ceilings |
| `--rect-overlay-max-block` | 720px | Window height ceiling, applied after the viewport cap |
| `--rect-overlay-margin` | 24px (12px mobile) | Gap between window and viewport edge |
| `--rect-overlay-radius` | 20px (16px mobile) | Window corner |
| `--rect-overlay-scrim` | rgba(24,24,27,.28) | Backdrop tint under the blur |
| `--rect-overlay-blur` | 10px | Backdrop blur |
| `--rect-app-blur` | 3px | Blur applied to the whole app behind a window |
| `--rect-z-overlay` | 1000 | Windows |
| `--rect-z-toast` | 1100 | Transient messages above windows |

### 2.11 Canvas

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

### 4.4 Search and filter toolbars

Search is one of the few controls users expect to recognise on sight. Its shape is
fixed by `SearchField` and must not be rebuilt per page.

Anatomy, in this order on one row:

```
[ 🔍 search field ] [ status filter ] [ sort ] ......... [ primary action ]
        320px             140px         176px            pushed to the end
```

Rules:

1. **A magnifying glass sits inside the field, at the start.** It is the universal
   search symbol; use the plain schematic version, because graphic detail slows
   recognition. It is decorative (`aria-hidden`) since the field already has a name.
2. **Never full width.** A search box spanning the page stops reading as a discrete
   control. Amazon deliberately caps its search box for this reason.
3. **Provide a real submit button** where results are fetched. Many users still
   expect to click rather than press Enter. Label it "Search" — never "Go" or "Submit".
   Clicking the icon or the button must both submit.
4. **Clear control appears only when there is a query**, at the end of the field.
   The native `::-webkit-search-cancel-button` is inconsistent, so it is suppressed
   and replaced.
5. **Placeholder is an example, never a label.** Every search field carries a real
   accessible name.
6. Wrap the row in `role="search"` so assistive technology can jump to it.
7. Filters keep capped widths (§2.3) and **wrap, never overflow**.
8. **Search widens while in use**, 320px → 400px, and returns at the same speed.
   The animation belongs on the element the toolbar actually lays out — the form
   — not on a nested child. A child can grow its own basis all it likes; if the
   parent is still sized to its old content, nothing visibly moves. This is the
   single most common reason an expand-on-focus appears to do nothing.
   Use `:focus-within` so the field stays open while the clear control is reached,
   and drop the growth entirely below 640px where the row already stacks.
8. Use `FilterBarSpacer` to push the page's primary action to the far end.

### 4.5 The data page skeleton

Every page that shows records follows the same shape, so a user who learns one page
has learned them all:

```
[ action bar    ]  search · filters · view toggle · primary action
[ summary row   ]  three to six headline figures
[ main content  ]  card grid or table, user's choice where both make sense
[ side panel    ]  breakdown, recent activity, or upcoming work
```

Rules:

1. **Summary figures must be derived from real records.** Count what is already
   loaded. A figure with no field behind it is not shown — no invented progress
   percentages, no health scores without a health field.
2. **Six figures maximum.** Past that they stop being read and become wallpaper.
3. **Cards for scanning, tables for comparing.** Offer both through `ViewToggle`
   where the records suit both, and remember the choice.
4. A card shows: status, identity, one or two lines of description, and the two or
   three fields a user scans for. It is a summary, not a record dump.
5. **Every card is one link with an explicit `aria-label`.** Without it the
   accessible name becomes the card's entire text.
6. The side panel is secondary. A page must still make sense without it.
7. `AvatarGroup` derives initials from names and works in both scripts. It never
   assumes stored images.

### 4.6 Checkbox / switch

Visual box 16–18px, but the label row is 32px min-height so the target clears WCAG. Switch track 36×20 with a 16px thumb.

### 4.7 Cards

| Kind | Padding | Radius |
|---|---:|---:|
| Dense metric card | 12px | 14px |
| Standard card | 16px | 14px |
| Empty-state card | 24px | 18px |

1px soft border, card background. Do not nest a bordered card inside a bordered card — use a divider instead.

### 4.8 Tables

- Default row **32px**, header row **32px**, sticky header, 12px cell x-padding.
- Body 13px; header 12px semibold, secondary colour.
- Text left (start), **numbers right (end) with tabular numerals**, status badges centred.
- Row hover: subtle neutral fill. No zebra striping unless it measurably helps.
- Wrapper has 1px border + 14px radius and owns the horizontal scroll.
- Empty tables render a centred, user-facing message row — never a blank body.
- Under `pointer: coarse`, rows expand to 48px automatically.

### 4.9 Badges

22px min-height, 11px bold, pill radius, 8px x-padding. Tones carry **meaning only**: `success` complete/healthy, `warning` at risk, `danger` late/critical, `info` neutral system, `accent` category. Never decorative colour.

### 4.10 Windows (modals, dialogs, drawers)

Never build one. See **§12 The window system** — every window in the product comes from the
shared `Overlay`. A feature that writes its own backdrop, sizing, or close button is a defect.

### 4.11 Empty, loading, error, permission states

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

### Duration and easing tokens are separate

`--rect-motion-*` tokens carry **duration + easing** and are for the `transition` shorthand.
`--rect-ease-*` tokens carry **easing only** and are for the `animation` shorthand.

```css
/* WRONG — in `animation`, the second <time> is the DELAY.
   This waits 280ms, then animates for 200ms. */
animation: fade-in 200ms var(--rect-motion-spring) both;

/* RIGHT */
animation: fade-in var(--rect-duration-overlay) var(--rect-ease-spring) both;
transition: opacity var(--rect-motion-nav);
```

Never put a duration-bearing token in an `animation` shorthand. It fails silently — the
animation still runs, just delayed, so it reads as "sluggish" rather than "broken".

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

## 11. The building blocks

**Rectangle is assembled, not drawn.** Every screen is composed from `@/shared/ui`.
Feature folders hold **data and composition**; they never introduce new UI
vocabulary. This is what keeps a page built next year looking like one built today.

### 11.1 The kit

| Block | Use |
|---|---|
| `Button` · `IconButton` | All actions |
| `Field` · `Input` · `Select` · `Textarea` · `Checkbox` · `Switch` | All form controls |
| **`SearchField`** · **`FilterBar`** · **`FilterSelect`** · **`FilterBarSpacer`** | **Every search and filter toolbar** (§4.4) |
| **`StatRow`** · **`StatCard`** · **`CardGrid`** · **`SidePanel`** · **`BreakdownBar`** · **`AvatarGroup`** · **`ViewToggle`** | **Every data page skeleton** (§4.5) |
| `Card` · `Toolbar` · `PageGrid` · `PageHeader` | Page composition |
| `DataTable` | Every tabular surface |
| `Badge` | Status and counts |
| `EmptyState` · `LoadingState` · `ErrorState` · `SuccessState` · `WarningState` | The four required data states |
| **`Overlay`** · **`FormDialog`** · **`ConfirmDialog`** | **Every window** (§12) |
| **`SettingsSection`** · **`SettingRow`** · **`ChoiceGroup`** · **`SettingsStack`** | **Every configuration surface** (§13) |
| `Drawer` · `Toast` | Side panels and transient messages |

### 11.2 Rules

1. **Import from `@/shared/ui`.** Never reach into a sibling feature for UI.
2. **A feature may style layout, never appearance.** Grid areas and column spans are
   the feature's business. Padding, radius, colour, and control size are the kit's.
3. **If two screens need the same thing, it belongs in the kit** — not copied. Copy
   and paste is how a product stops looking like one product.
4. **Adding a block means adding its tests in the same change.**
5. **Check this table before writing new UI.** Duplication is rejected in review and
   by `canvas-contract.test.tsx`.

### 11.3 When to add a block

Add one when a pattern appears a **second** time, or when getting it right requires
knowledge a feature author should not need to carry — focus trapping, scroll
locking, search affordance, disclosure state. Those belong in one tested place.

A block is finished when it has: a single clear purpose, tokens for every value,
loading/empty/error handling where it owns data, an accessible name, keyboard
support, RTL correctness, and tests.

### 11.4 Theming is centralized

Every colour, size, radius, weight, and duration resolves to a token in
`apps/web/src/shared/styles/tokens.css`. **Changing the theme means editing that one
file**, and the entire product follows. A literal colour in component CSS breaks that
guarantee and is rejected by test.

---

## 12. The window system

**One component powers every window: `Overlay`.** Create user, create project, create user type,
confirmations, detail panels — all the same component. Two thin wrappers cover the common shapes:

| Component | Use |
|---|---|
| `Overlay` | Base window. Custom content and footer. |
| `FormDialog` | Create/edit. Supplies form wiring, submit/cancel, pending state, error surface. |
| `ConfirmDialog` | Confirmations. Supplies confirm/cancel and destructive tone. |

### 12.1 Structure — fixed, not negotiable

```
header   title + optional description + close      never scrolls
body     the ONLY scroll region                    flex: 1, min-height: 0
footer   actions                                   never scrolls, never clipped
```

Actions **must** be in the footer. An action inside the scroll area can be scrolled out of
reach, which is the single most common way a window becomes unusable.

### 12.2 Sizing — viewport first, ceiling second

| Size | Max width | Use |
|---|---:|---|
| `sm` | 420px | Confirmations, single field |
| `md` | 560px | **Default.** Standard create/edit |
| `lg` | 760px | Multi-column forms |
| `xl` | 960px | Dense detail or side-by-side content |

```css
max-block-size: min(calc(100dvh - 2 * margin), 720px);
```

- **The viewport cap is applied before the size ceiling.** A window can never exceed the screen.
- Use **`dvh`, never `vh`** — mobile browser chrome makes `vh` taller than the visible area,
  which pushes the footer off-screen.
- **`min-height: 0` on the scrolling body is mandatory.** A flex child defaults to
  `min-height: auto` and refuses to shrink, so `overflow-y: auto` silently does nothing and the
  window grows past the screen. This is the most common cause of oversized dialogs.
- Under 640px the window docks to the bottom and its actions go full width.
- Under 560px tall the window takes nearly the full height rather than keeping a fixed ceiling.

### 12.3 Backdrop — blur the whole application

- The overlay **portals to `document.body`**. This is structural, not stylistic: the main canvas
  carries a `transform`, which makes it a containing block for `position: fixed`, so an in-tree
  window is trapped inside the canvas and its backdrop covers only that container.
- The **entire app blurs** behind an open window (`.rect-has-overlay .rect-app`), not just the
  region the window sits in. Nav, canvas and AI panel all recede together.
- Blur plus a light scrim. Blur alone leaves the window's edge indistinct.
- `prefers-reduced-transparency` gets a solid scrim and no blur.

### 12.4 Motion

| Element | Duration | Easing |
|---|---:|---|
| Scrim fade in | `--rect-duration-overlay-scrim` (110ms) | `ease-out` |
| Surface in | `--rect-duration-overlay` (140ms) | `--rect-ease-spring` |
| Scrim fade out | `--rect-duration-overlay-scrim-exit` (90ms) | `--rect-ease-in` |
| Surface out | `--rect-duration-overlay-exit` (110ms) | `--rect-ease-in` |

**Exit is faster than entry and uses the opposite easing.** Easing *out* on the way
out makes an element look like it is lagging behind the user's decision; the window
should arrive gracefully and leave promptly.

Four rules make the close feel calm rather than glitchy. Each one was learned from a
visible defect:

1. **Drive both directions from `data-state="open" | "closed"`, never a modifier
   class.** Selecting on state swaps the animation *name*, and a changed name is what
   lets the browser restart the entry animation if the window is reopened mid-exit.
   Toggling a class on the same animation leaves it stuck in its exited appearance.
2. **Release scroll lock, dimming, and focus on unmount — not when `open` flips.**
   The window outlives `open` by the length of its exit. Releasing early un-blurs the
   page, returns the scrollbar, and moves focus while the window is still fully
   visible, so the two halves of one gesture run in opposite order.
3. **Blur once.** The scrim is `position: fixed; inset: 0` with its own
   `backdrop-filter`, which already blurs everything behind it and fades in exact step
   with the scrim's own opacity. A second `filter` on the shell subtree forces the
   browser to rasterise the whole application every frame, and its transition runs on
   an independent clock that outlasts the exit. Keep the subtree filter only inside
   `@supports not (backdrop-filter: ...)`.
4. **Reserve the scrollbar with `scrollbar-gutter: stable`.** Locking body scroll
   removes the scrollbar and widens the viewport, shifting every centred element
   sideways mid-animation. With the gutter reserved, skip the JavaScript padding
   compensation too, or the two will double-count.

A closing window must stay mounted until its animation finishes, otherwise React
removes the node and no exit motion ever runs. Use `useExitTransition`, which keys
completion off `animationend` so the CSS owns the duration.

### 12.5 Behaviour — required, all of it

- Escape closes (opt out only where loss is costly).
- Backdrop press closes, but only when the press **starts and ends** on the scrim, so a drag
  that began inside never dismisses.
- Focus moves into the window on open and returns to the trigger on close.
- Focus is trapped; Tab and Shift+Tab wrap inside.
- Background scroll is locked, with scrollbar-width compensation so nothing shifts.
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, and `aria-describedby` when a
  description is present.
- `data-autofocus="true"` marks the field that should receive focus.

---

## 13. Configuration surfaces

Settings-style screens are built from shared blocks so every section behaves identically.

- `SettingsSection` — a **controlled disclosure**. Icon, title, description, optional status,
  and an explicit chevron that rotates on open.
- `SettingRow` — label + description + control. Wraps the control below the text when space
  runs out instead of overflowing.
- `ChoiceGroup` — segmented single-select with **radio semantics**.
- `SettingsStack` — vertical rhythm between sections.

Rules:

1. **Never use `<details>`/`<summary>`.** Its marker must be hidden to match the design, and
   hiding it leaves no way to tell an open section from a closed one.
2. Expanded state must be readable from the **header alone** — `aria-expanded` plus a rotating
   chevron. Never rely on the presence of content below.
3. `aria-controls` must link every trigger to its panel.
4. One section open at a time keeps long settings pages scannable.
5. A single choice uses **radio semantics**, not pressed toggle buttons — pressed buttons report
   multiple independent states to assistive technology, which is wrong for a single choice.
6. Never place a status value in prose next to a control that changes it; put it in the row's
   description or a `Badge` in the section header.
7. Admin-only sections are hidden entirely from users who lack the permission.

---

## 14. Adaptive and bulletproof

Every screen must survive any viewport, any content length, and any language. Non-negotiable:

1. **Nothing may exceed the viewport.** Cap against `dvh`/`dvw` before applying any fixed size.
2. **`dvh` over `vh`.** Always.
3. **Every flex/grid child that scrolls needs `min-width: 0` / `min-height: 0`.** Without it the
   child refuses to shrink and pushes its parent past the screen. This single rule prevents most
   overflow bugs.
4. **Rows wrap, they do not overflow.** Use `flex-wrap: wrap` with a shrinkable text column.
5. **Content-driven columns.** `repeat(auto-fit, minmax(200px, 1fr))` rather than a fixed count.
6. **Long strings must not break layout.** Use `overflow-wrap: anywhere` or truncate with a title.
7. **Test the extremes**: 320px wide, 560px tall, 4K, 200% zoom, and Arabic (which runs longer
   than English in many labels).
8. **Never assume pointer type.** Coarse pointers get 48px targets automatically.
9. **One scroll container per region.** Nested scrollers trap users.
10. **No fixed heights on content.** Use `min-height` and let content breathe.

---

## 15. Destructive and lifecycle actions

Friction must match the blast radius. A single confirmation on everything teaches
users to click through without reading, so the one that mattered gets dismissed on
autopilot.

| Action | Reversible? | Friction |
|---|---|---|
| Change status, archive | Yes | None. It is one move and it can be moved back. |
| Remove a member or stakeholder | Recreatable | Simple confirmation naming the person. |
| Delete a record permanently | No | Confirmation that names the object, states the consequence, and offers the reversible alternative. |

Rules:

1. **Prefer archive over delete.** Archiving keeps history and can be undone;
   deletion cannot. Always mention archiving in a delete confirmation.
2. **Put the verb in the button** — "Delete project", never "OK" or "Yes".
3. **Name the specific object** in the confirmation body, not "this item".
4. **State the consequence plainly**: what is removed and whether it can be recovered.
5. **Group lifecycle moves in one control**, not scattered buttons, and only offer
   moves that would change something.
6. **Destructive actions never sit next to routine ones** where a mis-click is easy.
7. Deleting writes its audit entry **before** the row disappears, since the audit
   trail becomes the only remaining record.

---

## 16. Layout correctness traps

These are not style preferences. Each one has shipped a visible defect in this
product, and each is now enforced by a test.

### 15.1 `flex-basis` follows the main axis

```css
/* A row: basis is a WIDTH. Correct. */
.row        { display: flex; }
.row__text  { flex: 1 1 220px; }

/* The same element in a column: basis is now a HEIGHT.
   This silently reserves 220px of vertical space. */
.row--stacked { flex-direction: column; }
```

**Any rule that changes `flex-direction` must reset a basis set for the other
axis.** In the stacked settings row this opened a ~220px void above every group of
fields, and it read as "too much spacing" rather than as a broken box model — so
the instinct is to shrink gaps, which never fixes it.

```css
.row--stacked .row__text { flex: 0 0 auto; }
```

**When a gap looks wrong, inspect the box model before tuning a token.**

### 15.2 A narrower flex child does not centre itself

A flex child with a `max-width` smaller than its parent aligns to the **start**, so
every pixel of leftover space piles onto one side. Capped content columns need
`margin-inline: auto` — the logical property, so RTL stays correct.

### 15.3 Content must never sit flush against a clipped edge

`overflow: hidden` and `overflow-x: hidden` clip at the **border box**. A focus ring
drawn with `outline-offset` lives outside that box, so a control touching the edge
loses part of its ring and looks cropped.

Any clipping scroll container needs a small inline padding, and controls inside it
must be width-capped (§2.3) rather than stretched to the boundary.

### 15.4 Checklist for any new layout

- [ ] Does any rule flip `flex-direction`? If so, is the basis reset?
- [ ] Is a capped-width column centred with `margin-inline: auto`?
- [ ] Does anything sit flush against a clipping edge?
- [ ] Do toolbar controls have capped widths, or do they stretch?
- [ ] Does the row wrap instead of overflowing at 320px?

---

## 17. Language and translation

Rectangle is Arabic-first and English-capable. **Every user-visible string comes
from a translation**, with no exceptions, because a single hardcoded label is all
it takes for a screen to switch back to English mid-sentence.

### 16.1 Where copy lives

```
shared/i18n/locales/
  types.ts      LocaleBundle — types a language against English
  enums.ts      values the API stores as machine keys
  projects.ts   one file per feature, both languages side by side
  team.ts
```

Each file exports `{ en, ar }` with the Arabic bundle typed as
`LocaleBundle<typeof en>`. Add an English key without an Arabic one and
**the build fails**. That is deliberate: i18next silently falls back to English at
runtime, so nothing would otherwise reveal the omission.

### 16.2 Rules

1. **No user-visible literal in a component.** Enforced by test on
   `label`, `title`, `description`, `placeholder`, `caption`, `header`, `message`,
   `submitLabel`, `confirmLabel`, `emptyMessage`, `hint`, and `status` props.
2. **Translate enums at the edge.** The API returns `on_hold`; only the interface
   turns it into words, through `enums`. Never store translated text.
3. **Never translate tenant data.** A company's own project or user-type names are
   shown exactly as authored. Seeded records carry a stable key and are translated
   through `enums.systemUserType`.
4. **Validation messages are keys**, resolved where they are rendered, so errors
   speak the user's language too.
5. **Interpolate, never concatenate.** `t("x", { name })`, because word order
   differs between languages.
6. **Punctuation is translatable.** Arabic uses `،` for lists; that separator is a
   token like any other string.
7. **Arabic has six plural categories** to English's two. Supply `_zero`, `_two`,
   `_few`, and `_many` where a count is shown.
8. Codes such as currency or `EPC` are language-neutral and stay as they are.

### 16.3 Adding a feature

Create `locales/<feature>.ts` with both languages, register it in `resources.ts`,
and use `t()` from the first line of the component. Retrofitting translation later
is how 117 English strings accumulated across four pages.

---

## 18. Deployment safety

Rectangle auto-deploys to Railway from `main`. The Dockerfile builds each app from a
**subset** of the repository, so code that compiles locally can still fail the deploy.

Rules:

1. **An app may only import from inside its own directory.** `apps/web` cannot import from
   `design/`, `docs/`, or `apps/api`, because those paths are not copied into its build stage.
2. **Repo-level checks live in `scripts/checks/`**, never inside a deployable app.
3. **`./scripts/verify.sh` is the gate.** It runs the app suites plus:
   - `token-snapshot.mjs` — design token snapshot matches the shipped CSS
   - `deploy-context.mjs` — no app imports escape its Docker build context
   - `docker-build-sim.sh` — rebuilds each image stage from a reproduced context
4. **Never push without a green `verify.sh`.** A passing app test suite alone does not prove
   the image will build.
5. When the Dockerfile's `COPY` list changes, update `deploy-context.mjs` and
   `docker-build-sim.sh` in the same commit; the context check self-verifies against the
   Dockerfile and fails if they disagree.

---

## 19. Definition of done for any UI work

- [ ] Every spacing, size, radius, weight and font-size comes from a token in §2.
- [ ] The page mounts inside `.rect-panel__content` and adds no outer width or margin.
- [ ] The page title is not duplicated inside the content area.
- [ ] Loading, empty, error and no-permission states all exist and are user-facing.
- [ ] No banned wording (§5) and no internal identifiers are visible.
- [ ] Every visible string comes from a translation; both languages are complete (§16).
- [ ] Enum values render through the `enums` namespace, never as raw keys.
- [ ] Reviewed in Arabic/RTL; logical properties used throughout.
- [ ] Smallest interactive target ≥ 24px; verified at `pointer: coarse`.
- [ ] Keyboard path and focus ring verified.
- [ ] No second full-page scroll container; any new scroll region has an overflow affordance.
- [ ] Dialogs fit the screen and never clip their actions.
- [ ] Semantic colour carries meaning only.
- [ ] Search and filters come from `SearchField`/`FilterBar`/`FilterSelect`.
- [ ] Toolbar control widths are capped and hint at the expected input (§2.3).
- [ ] No rule flips `flex-direction` while leaving a basis set for the other axis (§15.1).
- [ ] Capped-width columns are centred with `margin-inline: auto` (§15.2).
- [ ] Nothing sits flush against a clipping scroll edge (§15.3).
- [ ] Every window comes from `Overlay`/`FormDialog`/`ConfirmDialog`; none is hand-rolled.
- [ ] Window actions are in the footer and reachable at 560px viewport height.
- [ ] Configuration UI uses `SettingsSection`/`SettingRow`/`ChoiceGroup`.
- [ ] Verified at 320px wide and 560px tall with nothing clipped or overflowing.
- [ ] Nothing new was built that already exists in the block table (§11).
- [ ] No import escapes the app directory into `design/`, `docs/`, or another app.
- [ ] Focus indicators are drawn inside the element so containers cannot clip them.
- [ ] Engaged controls darken their existing border via `--rect-border-active` (§2.4).
- [ ] Any expand-on-focus animates the element its parent lays out, not a child.
- [ ] Destructive actions follow the friction ladder in §15.
- [ ] `node scripts/checks/feature-checklist.mjs` passes for this page.
- [ ] `./scripts/verify.sh` passes in full, including the deployment checks (§18).
