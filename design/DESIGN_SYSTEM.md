# Rectangle — Design System (from approved demo shell)

**Source of truth demo:** [`demo/shell.html`](./demo/shell.html)  
**Status:** Visual direction **approved**. Rebuild in production framework next (not ship this HTML as the product).

> The product is a **dark outer chrome + white floating “rectangle” work surface**.  
> That white panel *is* the brand metaphor.

---

## 1. Concept

| Layer | Role |
|-------|------|
| **Void / chrome** | Near-black canvas (`#0b0b0b`) — app frame, navigation lives here |
| **The Rectangle** | White main panel — heavy black border, huge radius, deep shadow — *all real work happens inside* |
| **Wordmark** | Lowercase `rectangle` (weight 900) → collapses to **`R`** |

Navigation is secondary and quiet. The white panel is primary and solid.

---

## 2. Layout

```
┌ body (padding 16px, #0b0b0b) ─────────────────────────┐
│  ┌ menu ──┐  gap 12px  ┌ main-panel (flex 1) ───────┐ │
│  │ logo   │            │ [edge zone][toggle ○]      │ │
│  │ nav…   │            │ header                     │ │
│  │ spacer │            │ stats / content            │ │
│  │ footer │            │ …                          │ │
│  └────────┘            └────────────────────────────┘ │
└───────────────────────────────────────────────────────┘
```

| Token | Expanded | Collapsed |
|-------|----------|-----------|
| Menu width | `160px` | `52px` |
| App gap | `12px` | same (animated) |
| Body padding | `16px` | `8px` on small screens |
| Main panel radius | `32px` | `24px` mobile |
| Main panel border | `4px solid #000` | same |
| Main panel padding | `28px 32px` | `16px` mobile |

**Z-index:** menu `1` · main panel `2` · edge hover `25` · toggle `30`

---

## 3. Color

### Chrome (outside the rectangle)

| Token | Value | Use |
|-------|--------|-----|
| `--chrome-bg` | `#0b0b0b` | Page / app background |
| `--nav-text` | `rgba(255,255,255,0.5)` | Idle nav |
| `--nav-text-hover` | `#ffffff` | Hover / active label |
| `--nav-bg-hover` | `rgba(255,255,255,0.06)` | Hover pill |
| `--nav-bg-active` | `rgba(255,255,255,0.08)` | Active item |
| `--logo` | `#ffffff` | Wordmark |

### Surface (inside the rectangle)

| Token | Value | Use |
|-------|--------|-----|
| `--surface` | `#ffffff` | Main panel |
| `--surface-border` | `#000000` | 4px outer border |
| `--surface-divider` | `#f0f0f0` | Header rule |
| `--text-primary` | `#111111` | Titles, values |
| `--text-secondary` | `#888888` | Stat labels |
| `--text-muted` | `#aaaaaa` | Placeholders |
| `--card-bg` | `#f8f9fa` | Stat cards / chart wells |
| `--card-border` | `#eaeaea` | Card stroke |
| `--badge-bg` | `#f5f5f5` | Pill badge |
| `--badge-border` | `#e0e0e0` | Badge stroke |
| `--badge-text` | `#333333` | Badge label |

### Toggle control

| Token | Value |
|-------|--------|
| Background | `#ffffff` → hover `#f5f5f5` |
| Border | `#e8e8e8` → hover `#cccccc` |
| Icon | `#333333` |

**No brand accent color in the demo.** Add one later for CTAs / severity (risk critical, etc.) without breaking the mono shell — candidate: a single saturated accent used sparingly inside the white panel only.

---

## 4. Typography

| Token | Value |
|-------|--------|
| Family | **Inter** (400 / 500 / 600 / 700 / 900) |
| Logo | 900, `2rem` expanded · `1.8rem` collapsed · tracking `-0.03em` |
| Page title | 700, `1.6rem`, `#111`, tracking `-0.02em` |
| Nav item | 500, `0.95rem`, tracking `-0.01em` |
| Stat label | 600, `0.8rem`, uppercase, tracking `0.03em`, `#888` |
| Stat value | 700, `1.8rem`, `#111`, tracking `-0.02em` |
| Badge | 600, `0.8rem` |

**Favicon:** letter **R**, Inter 900, black on transparent.

---

## 5. Shape & elevation

| Element | Radius | Shadow / border |
|---------|--------|-----------------|
| Main panel | `32px` | `4px` black border + `0 25px 50px -12px rgba(0,0,0,0.8)` (hover deeper) |
| Nav item | `10px` | none |
| Stat card | `16px` | `1px #eaeaea` |
| Chart well | `16px` | `1px #eaeaea` + subtle hatch |
| Badge / chart chip | `40px` (pill) | light border |
| Menu toggle | `36×36` circle | lower-left chrome above Profile/Logout; off-white circle + black icon |
| Collapsed AI launcher | `36×36` circle | top-right of main canvas, opens universal assistant |

---

## 6. Motion

| Property | Timing |
|----------|--------|
| Menu width / padding / logo | `0.4s cubic-bezier(0.4, 0, 0.2, 1)` |
| Toggle appear | `0.25s` opacity · springy scale `cubic-bezier(0.34, 1.56, 0.64, 1)` |
| Nav hover | `0.2s ease` |
| Chevron flip when collapsed | `0.4s` same spring |
| Panel shadow hover | `0.3s ease` |

**Do not** animate the logo text itself (demo explicitly keeps logo static aside from size/collapse swap).

---

## 7. Components (demo inventory)

### 7.1 Shell
- `AppShell` — flex row, optional `.collapsed`
- `SideNav` — logo, primary items, spacer, footer items (Profile / Logout)
- `MainPanel` — white rectangle, hosts all routes
- `NavToggle` — circular lower-left menu control above the Profile/Logout section; icon-only, inverted against dark chrome
- `AiAssistantPanel` — right-side retractable mini-rectangle for system AI chat; shell-owned, not feature-owned
- `AiFloatingButton` — collapsed AI state as a circular icon in the top-right corner of the main canvas

### 7.2 Navigation item
- Icon (22×22 stroke SVG, 2px, round caps) + label
- States: default · hover · active
- Collapsed: icon only, centered, slightly larger icon

### 7.3 Panel header
- Page title only (left) — never repeat the `rectangle` brand word inside the work surface
- Browser tab title follows the opened page: `<Page> · Rectangle`
- Bottom divider `2px #f0f0f0`

### 7.4 Stat card
- Uppercase muted label + large value
- Soft gray fill, 16px radius

### 7.5 Chart / content well
- Empty-state hatch background + centered pill label (placeholder only)

---

## 8. Interaction spec (shell)

| Action | Behavior |
|--------|----------|
| Click toggle | Toggle `.collapsed` on app |
| Click edge hover zone | Same toggle |
| Double-click main panel within ~40px of left edge | Toggle |
| Keyboard on toggle | Enter / Space toggles |
| Collapsed | Logo → `R`; labels hidden; toggle stays more visible |
| Right AI toggle | Retract / expand the AI assistant mini-rectangle; no fake AI response before model connection |

---

## 9. Responsive

| Breakpoint | Behavior |
|------------|----------|
| `≤768px` | Column layout; menu becomes horizontal wrap; collapse behavior relaxed (labels stay); panel radius `24px`; stats 1 column |
| `≤480px` | Smaller type and toggle |

Production mobile will likely move to a **bottom bar or drawer** later; keep the **white rectangle** metaphor.

---

## 10. Iconography

- Stroke icons only (no fill), `currentColor`
- `stroke-width: 2` (toggle chevron `2.5`)
- 24×24 viewBox; display ~22px in nav
- Style family: simple geometric (grid, folder, bars, users, gear, user, logout)

When expanding the PMO IA, keep the same stroke language (Lucide / Heroicons outline are compatible).

---

## 11. Mapping demo nav → Rectangle product IA

Demo is a **shell stub**. Product navigation should grow from research taxonomy without changing chrome:

| Demo | Product (v1 direction) |
|------|-------------------------|
| Overview | Today / Command center (risks, due, AI brief) |
| Projects | Projects portfolio |
| Analytics | PMO / portfolio health, EVM, reports |
| Team | Team & workload |
| Settings | Org, members, integrations |
| *(add)* | Tasks, Schedule, Risks, Documents, Approvals, AI |

Footer: Profile · Logout (later: help, theme if needed).

---

## 12. Production rebuild targets

| Concern | Demo | Target |
|---------|------|--------|
| Markup | Static HTML | React components |
| Style | One CSS block | CSS variables + Tailwind **or** CSS Modules — match tokens exactly |
| Font | Google Fonts CDN | Self-host Inter (privacy / offline) |
| Icons | Inline SVG | Shared icon set |
| State | `classList.toggle` | React state / URL for nav |
| i18n | EN only | EN + AR with **RTL** flip of shell (menu on right in RTL) |
| A11y | Partial | Focus rings, `aria-expanded` on toggle, landmarks |

**Do not** copy `user-select: none` on `body` into production — blocks text selection in real app content.

---

## 13. Design do / don’t

**Do**
- Keep black void + white heavy-bordered rectangle
- Keep Inter + extreme logo weight
- Keep quiet gray nav on chrome
- Keep large radius and deep shadow on the work surface

**Don’t**
- Fill the outer chrome with white or busy gradients
- Use thin weak borders on the main panel
- Introduce many accent colors in the shell
- Animate the wordmark flashily
- Make the side nav wider/heavier than the panel

---

## 14. Token file

Machine-readable tokens: [`tokens/shell.tokens.json`](./tokens/shell.tokens.json)
