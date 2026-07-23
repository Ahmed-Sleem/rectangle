# Rectangle GUI sizing rules — dense desktop standard

**Status:** Mandatory for all Rectangle GUI work after 2026-07-23.  
**Scope:** Desktop-first product UI: shell, feature pages, right AI assistant panel, cards, tables, forms, drawers, and toolbars.  
**Goal:** Fit many construction / PMO controls on screen without making the product feel cramped, inconsistent, or toy-like.

---

## 0. Research basis

This standard combines current design-system patterns and dense-dashboard guidance:

- 8-point spacing grids are a common baseline for web app consistency; 12-column grids are recommended for flexible desktop layouts; dense dashboards should use narrower gutters than editorial layouts. Source: UXPin grid guide — https://www.uxpin.com/studio/blog/ui-grids-how-to-guide/
- Dense dashboards should use minimal padding around widgets, compact readable typography, sticky/frozen table headers, right-aligned numbers, and data-first layout. Source: DESIGN.md data-dense dashboard notes — https://designmd.app/library/data-dense-dashboard/
- 4px sub-steps are useful inside small components; 8px steps are preferred between components. Source: Breakdance 8-point grid practical guide — https://breakdance.com/the-8-point-grid-system-a-practical-guide/
- Material/accessible touch targets trend toward 48px touch targets and 8px separation on touch devices. Desktop mouse interfaces may be denser, but touch/coarse-pointer breakpoints must expand controls. Sources: Material metrics/keylines — https://m1.material.io/layout/metrics-keylines.html and Interaction Design Foundation tappability — https://www.interaction-design.org/literature/article/how-to-use-tappability-affordances
- IBM Carbon data tables define multiple density rows: 24px, 32px, 40px, 48px, 64px. Rectangle defaults to 32px dense rows and uses 40px when readability matters. Source: Carbon data table style — https://carbondesignsystem.com/components/data-table/style/
- Microsoft Fluent documents Standard vs Compact sizing for information-rich UI, with 14px body text and compact modes for dense scenarios. Source: Microsoft Windows spacing — https://learn.microsoft.com/en-us/windows/apps/design/style/spacing
- Fluent design tokens show the value of tokenized spacing/typography instead of hardcoded one-off pixels. Source: Fluent UI styling tokens — https://learn.microsoft.com/en-us/fluent-ui/web-components/getting-started/styling

---

## 1. Non-negotiable principles

1. **Use tokens, not random pixels.** New spacing, radius, width, or typography values must be added as named tokens or selected from this file.
2. **Base unit = 8px.** Use 8px increments for page/layout spacing: `8, 16, 24, 32, 40, 48, 64`.
3. **Sub-unit = 4px.** Use 4px only inside tight controls: icon-label gaps, chip padding, hairline offsets, compact toolbar details.
4. **Dense desktop default.** Rectangle is for dashboards, schedules, documents, and PMO tables; default density is compact but readable.
5. **Touch expands.** On coarse pointer / mobile / tablet, controls must expand to at least 44–48px targets.
6. **The shell is stable.** Left menu, main canvas, and right AI panel are permanent shell zones. Feature pages only own the main canvas content.
7. **Tables are first-class.** Construction data lives in tables; row height, numeric alignment, sticky headers, and toolbar sizes are standardized.
8. **Soft monochrome only in shell.** Shell colors stay near-black/off-white; feature pages may add semantic colors only for status/severity.

---

## 2. Density modes

Rectangle uses three density levels, but **Compact Desktop** is the default.

| Mode | Use | Base control height | Table row | Page/card padding | Gap |
|---|---|---:|---:|---:|---:|
| `compact` | Desktop default, data-heavy PMO screens | 32px | 32px | 12–16px | 8–12px |
| `comfortable` | Forms, detail views, mixed content | 40px | 40px | 16–24px | 12–16px |
| `touch` | Coarse pointer, tablet, mobile | 44–48px | 44–48px | 16–24px | 16px |

Rules:

- Never use less than **28px** for an interactive desktop icon target.
- Prefer **32px** for compact desktop icon buttons and toolbar controls.
- Prefer **40px** for primary form inputs and important actions.
- Use **44–48px** at coarse-pointer/touch breakpoints.

---

## 3. Spacing scale

### 3.1 Layout spacing tokens

| Token name | px | Use |
|---|---:|---|
| `space-0` | 0 | flush joins only |
| `space-1` | 4 | icon-label gap, chip internals, tight adjustments |
| `space-2` | 8 | compact gaps, table cell x padding minimum |
| `space-3` | 12 | compact card padding, toolbar gaps |
| `space-4` | 16 | standard panel/card/form padding |
| `space-5` | 20 | dense section vertical rhythm |
| `space-6` | 24 | comfortable section padding |
| `space-8` | 32 | large panel padding, major groups |
| `space-10` | 40 | major vertical break |
| `space-12` | 48 | page section separation |
| `space-16` | 64 | rare dashboard grouping / landing sections |

### 3.2 Default spacing choices

| Context | Default | Minimum | Maximum without approval |
|---|---:|---:|---:|
| Shell body padding desktop | 14–16px | 12px | 24px |
| Shell gap between nav/main/AI | 10–12px | 8px | 16px |
| Main panel padding desktop | 24px x 28px | 20px | 32px |
| Feature page internal grid gap | 12px | 8px | 24px |
| Card padding dense | 12px | 10px | 16px |
| Card padding comfortable | 16px | 12px | 24px |
| Form field vertical stack gap | 12px | 8px | 20px |
| Toolbar item gap | 6–8px | 4px | 12px |
| Icon-label gap | 6–8px | 4px | 10px |
| Table cell horizontal padding | 8–12px | 8px | 16px |
| Table cell vertical padding | 0, row-height controlled | 0 | 8px |

---

## 4. Shell layout dimensions

The shell has three permanent zones:

```text
[left menu] [main canvas / active feature page] [universal AI panel]
```

### 4.1 Left menu

| Item | Desktop value | Collapsed | Notes |
|---|---:|---:|---|
| Width | 152px | 40px | Smaller dense rail; must stay quiet and not compete with canvas |
| Horizontal padding | 4px | 2px | Compact by design |
| Nav item height | 32px | 32px | Dense but clickable with mouse |
| Nav icon | 18px | 18px | Stroke-only |
| Nav item radius | 8px | 8px | Soft but not pill-heavy |
| Logo height footprint | ~32px | ~28px | Do not animate word itself |

### 4.2 Main canvas / Rectangle

| Item | Desktop value | Tablet/mobile | Notes |
|---|---:|---:|---|
| Radius | 28px | 20–24px | Large brand shape |
| Border | 3px | 3px | Soft black, not pure #000 if using current palette |
| Padding | 24px 28px | 16px | Feature content starts inside this |
| Header height | 42px min | 40px min | Page title only |
| Header divider | 1px | 1px | Quiet divider |
| Body overflow | auto | auto | Feature pages must not break shell |

### 4.3 Right universal AI panel

The AI panel is **not a route, not a feature, and not page content**. It is a shell utility that stays available while the main canvas changes.

| Item | Desktop value | Collapsed | Notes |
|---|---:|---:|---|
| Width | 360px | 36px floating FAB | Enough for chat; collapsed state returns width to canvas |
| Tablet width | 320px | 36px floating FAB | At narrower desktop/tablet |
| Mobile behavior | full-width stacked | 48px rail | Below shell breakpoint |
| Radius | same as main panel | same | Mini-rectangle, same visual language |
| Border | same as main panel | same | Must feel part of Rectangle shell |
| Header padding | 18px | rail padding 8–14px | Compact assistant identity |
| Composer padding | 14px | hidden | Composer appears only expanded |

---

## 5. Desktop grid rules for feature pages

| Rule | Value |
|---|---|
| Preferred page grid | CSS grid, 12 columns |
| Dense dashboard gap | 8–12px |
| Standard dashboard gap | 16px |
| Major card span | 3, 4, 6, 8, 12 columns |
| Avoid | arbitrary 5/7/9 column spans unless layout needs it |
| Page scroll | inside main canvas body, not whole browser if possible |

Recommended dashboard patterns:

- KPI row: 4 cards × 3 columns, or 3 cards × 4 columns.
- Master/detail: table 8 columns + inspector 4 columns.
- Schedule workspace: Gantt 9 columns + details 3 columns.
- Documents: tree/list 3 columns + preview 9 columns.
- AI-heavy workflow: main content 8–9 columns; AI remains universal at shell right.

---

## 6. Typography scale

Use Inter. Keep dense screens legible.

| Role | px | Weight | Line-height | Notes |
|---|---:|---:|---:|---|
| App/page h1 | 20–22 | 750–800 | 1.15 | Main panel title |
| Section h2 | 16–18 | 700 | 1.2 | Card/section title |
| Subsection h3 | 14–15 | 650–700 | 1.25 | Dense panels |
| Body | 13–14 | 450–500 | 1.45 | Default desktop copy |
| Table body | 12.5–13 | 450–500 | 1.35 | Data dense |
| Label | 11–12 | 650–750 | 1.2 | Uppercase optional |
| Micro/help | 11–12 | 500–600 | 1.35 | Secondary metadata |
| Numeric KPI | 24–32 | 750–850 | 1.0 | Only for important values |

Rules:

- Do not use body text below **12px**.
- Prefer **13px** for dense table/cell UI.
- Prefer **14px** for form labels, content, readable settings pages.
- Use tabular numerals for cost, duration, percent, EVM, and schedule values.
- Right-align numeric table columns.

---

## 7. Component sizing

### 7.1 Buttons

| Kind | Height | Padding | Radius | Use |
|---|---:|---:|---:|---|
| Icon-only compact | 28–32px | square | 8–10px or transparent | toolbar/nav seam |
| Compact button | 32px | 12–16px x | 8–10px | dense tables/toolbars |
| Standard button | 40px | 16–20px x | 10–12px | forms/dialogs |
| Touch button | 44–48px | 16–24px x | 12px | coarse pointer/mobile |

### 7.2 Inputs

| Input | Dense | Standard | Notes |
|---|---:|---:|---|
| Text input | 32px | 40px | Dense in filters/toolbars; standard in forms |
| Select | 32px | 40px | Same as input |
| Textarea | 72–96px min | 96–128px min | Composer depends on context |
| Checkbox/radio visual | 16–18px | 18–20px | Click target can be larger |
| Switch | 32 x 18px | 40 x 22px | Avoid huge mobile switches on desktop |

### 7.3 Tables

| Table type | Row height | Header height | Toolbar |
|---|---:|---:|---:|
| Ultra-dense read-only | 28px | 32px | 32px |
| Rectangle default dense | 32px | 32px | 32–40px |
| Editable / mixed content | 40px | 40px | 40px |
| Two-line rows | 48–56px | 40px | 40–48px |

Rules:

- Header row height should match body row height unless there is a strong reason.
- Sticky headers are mandatory for long tables.
- Numeric columns: right aligned, tabular numerals.
- IDs/codes: monospace or tabular, never oversized.
- Row hover highlight: subtle neutral fill only.
- Zebra striping allowed only when dense data readability improves.

### 7.4 Cards

| Card | Padding | Radius | Border |
|---|---:|---:|---|
| Dense metric card | 12px | 14px | 1px soft |
| Standard card | 16px | 16px | 1px soft |
| Canvas panel/card | 20–24px | 18–24px | 1px soft |
| Main shell rectangle | 24–28px | 28px | 3px shell border |

### 7.5 Icons

| Context | Size | Stroke |
|---|---:|---:|
| Nav icons | 18px | 1.85–2px |
| Toolbar icons | 16px | 2px |
| Section icons | 18–20px | 2px |
| Empty state icons | 28–36px | 1.8–2px |
| Status dots | 6–8px | n/a |

Rules:

- Use outline icons only in shell.
- No filled decorative icon sets in shell.
- Icon-only controls must have accessible names.

---

## 8. Radius and border rules

| Element | Radius |
|---|---:|
| Main shell rectangle | 28px desktop, 20–24px mobile |
| AI side panel | same as main rectangle |
| Cards | 14–16px |
| Inputs/buttons | 8–12px |
| Chips/badges | 999px |
| Nav items | 8px |
| Tiny status dots | 999px |

Borders:

- Shell panel border: **3px** soft black (`#27272a` current token).
- Internal cards/inputs: **1px** soft border (`#e4e4e7` current token).
- Dividers: **1px** soft line (`#ececee` current token).
- Do not use many nested heavy borders inside the main panel.

---

## 9. Color and semantic status

Shell palette:

| Role | Current token direction |
|---|---|
| Chrome bg | near-black zinc |
| Surface bg | off-white |
| Border/text | soft black / zinc |
| Muted text | zinc gray |
| Cards | very light zinc |

Feature semantic colors may be added later, but only for meaning:

| Meaning | Use |
|---|---|
| Critical / late / high risk | red |
| Warning / at risk | amber |
| Healthy / complete | green |
| Info / neutral system | blue or zinc |

Rules:

- No decorative rainbow dashboards.
- Every non-monochrome color must communicate state, category, or action.
- Keep AI panel monochrome until real model state semantics exist.

---

## 10. Motion

| Motion | Duration | Easing |
|---|---:|---|
| Nav width collapse | 280–350ms | cubic-bezier(0.4, 0, 0.2, 1) |
| AI panel collapse | 280–350ms | same as nav |
| Hover states | 120–180ms | ease |
| Press scale | instant–120ms | ease-out |
| Page transitions | avoid initially | keep feature switching fast |

Rules:

- Respect `prefers-reduced-motion`.
- Never animate layout so much that data jumps unpredictably.
- No flashy logo/wordmark animation.

---

## 11. Breakpoints

| Breakpoint | Behavior |
|---|---|
| `>= 1280px` | Full shell: left nav + main canvas + AI side panel |
| `1100–1279px` | AI panel may reduce to 320px |
| `769–1099px` | Keep three-zone shell if usable; allow AI collapse by default later if needed |
| `<= 768px` | Stack nav, canvas, AI panel vertically; keep labels visible |
| Coarse pointer | Expand controls to 44–48px targets |

Desktop is the primary target, but the shell must not break at tablet/mobile widths.

---

## 12. Feature page checklist

Every new feature page must answer this before coding:

- [ ] What density mode? `compact`, `comfortable`, or `touch`?
- [ ] Which grid? 12-column, master/detail, table-first, or document preview?
- [ ] What are the primary data tables and row heights?
- [ ] What is the smallest interactive target on desktop?
- [ ] Does it need a right-side inspector, or should it use the universal AI panel only?
- [ ] Are all spacing values from this document?
- [ ] Are semantic colors meaningful, not decorative?
- [ ] Does it stay inside the main canvas and avoid modifying shell layout?
- [ ] Does it have empty/loading/error states without fake production data?

---

## 13. CSS token naming direction

When codifying this file into CSS variables, use this shape:

```css
:root {
  --rect-space-1: 4px;
  --rect-space-2: 8px;
  --rect-space-3: 12px;
  --rect-space-4: 16px;
  --rect-space-6: 24px;
  --rect-control-compact: 32px;
  --rect-control-standard: 40px;
  --rect-control-touch: 48px;
  --rect-table-row-dense: 32px;
  --rect-table-row-standard: 40px;
  --rect-grid-gap-dense: 8px;
  --rect-grid-gap-standard: 16px;
}
```

Do not add one-off component CSS values if a token exists.

---

## 14. Current shell conformance

Current base GUI intentionally follows this standard:

- Left menu: compact rail, 152px expanded / 40px collapsed, 32px nav rows.
- Main canvas: 28px radius, 3px soft black border, 24px/28px padding.
- AI panel: universal shell sidecar, 360px expanded; when collapsed it becomes a 36px circular floating icon in the top-right of the main canvas and no longer reserves side-panel width.
- Toggle controls: compact desktop targets placed in the main canvas corners: menu toggle is a 36px circular bottom-left canvas control with black/inner border; AI launcher is a black 36px circular top-right canvas control.
- Browser title: active page title + Rectangle.
- Feature pages: loaded by registry into main canvas only.

Future work should keep the shell stable and add product capability inside feature modules.
