# P0 — Rectangle shell app (GUI only, no feature pages)

**Status:** EXECUTED — P0 complete (validated before push)  
**Goal:** Production-ready **main shell** (dark chrome + white rectangle work surface) with **feature registry plumbing**, **zero real feature pages**, Railway-ready deploy config, tests, and CI hygiene.  
**Execution:** Followed checklist A→J. Feature pages intentionally empty (P1+).

---

## 0. Scope lock

### 0.1 In scope (must ship)

| # | Deliverable |
|---|-------------|
| 1 | `apps/web` — Vite + React 19 + TypeScript strict SPA |
| 2 | Pixel-faithful shell from `design/demo/shell.html` + `design/DESIGN_SYSTEM.md` + `design/tokens/shell.tokens.json` |
| 3 | Collapsible side nav, logo `rectangle` ↔ `R`, edge toggle, main white panel |
| 4 | **Feature module contract + registry** that can discover modules (glob) |
| 5 | Router: shell layout + **placeholder outlet only** (no real pages) |
| 6 | Empty / idle state inside the white panel (“No feature mounted” or similar — design-consistent) |
| 7 | Production build (`npm run build`) + preview serve on `$PORT` |
| 8 | Railway config at repo root and/or `apps/web` so GitHub → Railway works |
| 9 | ESLint + TypeScript no-emit check + unit tests for registry/collapse logic |
| 10 | README section for running web app locally |
| 11 | A11y basics: landmarks, `aria-expanded` on toggle, keyboard toggle, focus-visible |
| 12 | **No** `user-select: none` on `body` (explicitly forbidden — demo had it) |
| 13 | Self-hosted or properly licensed Inter (prefer `@fontsource/inter` — no runtime Google Fonts dependency required for prod) |
| 14 | Commit + push to `Ahmed-Sleem/rectangle` `main` |

### 0.2 Explicitly out of scope (P0)

- Any real feature UI (projects list, risks, Gantt, AI chat, dashboards with fake business KPIs beyond shell chrome)
- Backend / API / database / auth
- i18n/RTL (structure may leave hooks; full AR is P1+)
- Micro-frontends / Module Federation
- Multiple Railway services
- Storybook (optional later)
- PWA / offline
- Changing research/ or redesigning the visual language

### 0.3 Definition of Done (DoD)

P0 is done only when **all** are true:

1. `cd apps/web && npm ci && npm run build && npm test && npm run lint && npm run typecheck` all exit 0  
2. `npm run preview` (or `start`) serves the shell on a port; collapse/expand works  
3. Visual match vs `design/demo/shell.html`: chrome color, panel border 4px black, radius 32px, Inter logo weight 900, nav hover/active, toggle behavior  
4. Feature registry loads **zero or only disabled/template entries** — nav primary items may be **static shell placeholders** OR empty primary nav with footer only — **decision in §3.4** (locked below)  
5. Railway config files present and documented; owner can connect GitHub without code changes  
6. No secrets in repo; no agent-rules files in public tree  
7. GitHub `main` contains the work  

### 0.4 Nav content decision for P0 (locked)

**P0 nav behavior:**

- Side nav shows the **same labels as the demo** (Overview, Projects, Analytics, Team, Settings + Profile, Logout) as **non-routing chrome placeholders** OR as routes that all render the **same empty panel state**.  
- **Preferred (production-shaped):** each label is a `FeatureModule` with `enabled: true`, `load` pointing to a **shared** `ShellEmptyState` page component living in `shell/` or `shared/` — **not** under fake feature business folders with fake stats.  
- Clicking nav updates URL (`/overview`, `/projects`, …) and active state; panel shows empty state + route id badge — **no charts, no revenue fake data**.  
- This proves registry + router + active nav without building features.

**Forbidden in P0:** demo’s Revenue / Visitors / Conversion stat cards and chart placeholder as product UI. Those were demo filler only.

---

## 1. Preconditions (before coding)

Execute in order:

- [ ] **1.1** Workspace contains only project-relevant trees: `rectangle/` (+ private `_working_docs/` locally, never committed).  
- [ ] **1.2** `git -C /home/user/rectangle status` clean or only intentional plan files.  
- [ ] **1.3** Remote is `Ahmed-Sleem/rectangle` on `main`.  
- [ ] **1.4** Read fully (do not skim):  
  - `design/demo/shell.html`  
  - `design/DESIGN_SYSTEM.md`  
  - `design/tokens/shell.tokens.json`  
  - `docs/ARCHITECTURE.md` §4–§8  
- [ ] **1.5** Node.js **20 LTS** available (`node -v`). If missing, install via nvm or apt before scaffold.  
- [ ] **1.6** Confirm this plan file path: `docs/plans/P0_SHELL_APP.md`.

---

## 2. Phase A — Monorepo / app scaffold

### A1. Create `apps/web` with Vite

- [ ] **A1.1** From repo root:

```bash
cd /home/user/rectangle
npm create vite@latest apps/web -- --template react-ts
```

- [ ] **A1.2** If interactive prompts appear, choose: React → TypeScript.  
- [ ] **A1.3** `cd apps/web && npm install`  
- [ ] **A1.4** Install runtime deps:

```bash
npm install react-router-dom
npm install @fontsource/inter
npm install lucide-react
```

- [ ] **A1.5** Install dev deps:

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
npm install -D eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh
npm install -D serve
```

(Adjust if Vite template already shipped eslint — extend, don’t duplicate fighting configs.)

### A2. TypeScript & path aliases

- [ ] **A2.1** `tsconfig.app.json` (or root app tsconfig):  
  - `"strict": true`  
  - `"noUncheckedIndexedAccess": true` (preferred)  
  - `"noEmit": true` for typecheck script  
  - paths: `"@/*"` → `"./src/*"`  
- [ ] **A2.2** `vite.config.ts`:  

```ts
resolve: { alias: { "@": path.resolve(__dirname, "src") } }
```

- [ ] **A2.3** Ensure `vite-env.d.ts` present.

### A3. Package scripts (`apps/web/package.json`)

- [ ] **A3.1** Scripts must include:

| Script | Command |
|--------|---------|
| `dev` | `vite` |
| `build` | `tsc -b && vite build` |
| `preview` | `vite preview --host 0.0.0.0 --port ${PORT:-4173}` |
| `start` | `serve -s dist -l tcp://0.0.0.0:${PORT:-3000}` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `lint` | `eslint src --max-warnings 0` |
| `typecheck` | `tsc -b --pretty false` |

- [ ] **A3.2** `"private": true`, `"type": "module"` as appropriate.  
- [ ] **A3.3** Engines: `"node": ">=20"`.

### A4. Root monorepo convenience (optional but recommended)

- [ ] **A4.1** Root `package.json` (workspace or simple scripts):

```json
{
  "name": "rectangle",
  "private": true,
  "scripts": {
    "dev": "npm run dev --prefix apps/web",
    "build": "npm run build --prefix apps/web",
    "test": "npm run test --prefix apps/web",
    "lint": "npm run lint --prefix apps/web",
    "start": "npm run start --prefix apps/web"
  }
}
```

- [ ] **A4.2** Update root `.gitignore` for `node_modules/`, `dist/`, `*.local`, `.env`, coverage (merge with existing, don’t wipe design/research ignores).

### A5. Delete Vite boilerplate UI

- [ ] **A5.1** Remove default `App.css` counter demo, assets react.svg, etc.  
- [ ] **A5.2** `index.html` title: `Rectangle`  
- [ ] **A5.3** Favicon: SVG data URL or `public/favicon.svg` with Inter-style **R** (black on transparent) per design system §4.

---

## 3. Phase B — Folder architecture (empty features OK)

Create this tree (files may be stubs until later phases fill them):

```text
apps/web/
  index.html
  package.json
  vite.config.ts
  tsconfig.json
  tsconfig.app.json
  tsconfig.node.json
  vitest.config.ts
  eslint.config.js
  public/
    favicon.svg
  src/
    main.tsx
    app/
      App.tsx                 # RouterProvider only
      router.tsx              # createBrowserRouter
      providers.tsx           # future-proof wrapper (identity for P0)
    shell/
      feature-types.ts        # FeatureModule contract
      registry.ts             # discover + sort + filter
      AppShell.tsx
      SideNav.tsx
      SideNavItem.tsx
      MainPanel.tsx
      NavToggle.tsx
      EdgeHoverZone.tsx
      ShellEmptyState.tsx     # empty content inside panel
      icons.tsx               # map icon name → lucide component
      shell.css               # OR shell.module.css — tokens applied here
      index.ts                # public shell exports only
    shared/
      styles/
        tokens.css            # CSS variables from shell.tokens.json
        reset.css             # minimal reset — NOT user-select:none on body
        global.css            # imports font + tokens + reset
      lib/
        cn.ts                 # optional classnames helper
      ui/                     # empty or minimal — no feature widgets required
        .gitkeep
    features/
      _template/              # copy-paste starter — NOT registered in nav
        index.ts
        README.md
      overview/
        index.ts              # FeatureModule → ShellEmptyState
      projects/
        index.ts
      analytics/
        index.ts
      team/
        index.ts
      settings/
        index.ts
    vite-env.d.ts
```

- [ ] **B1** Create all directories.  
- [ ] **B2** `features/_template/README.md` explains how to add a feature (copy ARCHITECTURE §7).  
- [ ] **B3** No business logic files under `features/*` beyond `index.ts` re-exporting empty state.

---

## 4. Phase C — Design tokens → CSS

### C1. Generate / hand-write `tokens.css`

- [ ] **C1.1** Map every color/space/radius/shadow/motion/z-index from `design/tokens/shell.tokens.json` to CSS custom properties on `:root` (and optionally `[data-theme]` later).  

Example naming convention (lock this):

```css
:root {
  --rect-chrome-bg: #0b0b0b;
  --rect-nav-text: rgba(255, 255, 255, 0.5);
  --rect-nav-text-emphasis: #ffffff;
  --rect-nav-hover-bg: rgba(255, 255, 255, 0.06);
  --rect-nav-active-bg: rgba(255, 255, 255, 0.08);
  --rect-logo: #ffffff;

  --rect-surface-bg: #ffffff;
  --rect-surface-border: #000000;
  --rect-surface-divider: #f0f0f0;
  --rect-text-primary: #111111;
  --rect-text-secondary: #888888;
  --rect-text-muted: #aaaaaa;
  --rect-card-bg: #f8f9fa;
  --rect-card-border: #eaeaea;
  --rect-badge-bg: #f5f5f5;
  --rect-badge-border: #e0e0e0;
  --rect-badge-text: #333333;

  --rect-toggle-bg: #ffffff;
  --rect-toggle-bg-hover: #f5f5f5;
  --rect-toggle-border: #e8e8e8;
  --rect-toggle-border-hover: #cccccc;
  --rect-toggle-icon: #333333;

  --rect-body-padding: 16px;
  --rect-app-gap: 12px;
  --rect-menu-width: 160px;
  --rect-menu-width-collapsed: 52px;
  --rect-panel-radius: 32px;
  --rect-panel-border-width: 4px;
  --rect-panel-padding: 28px 32px;
  --rect-nav-item-radius: 10px;
  --rect-card-radius: 16px;
  --rect-pill-radius: 40px;
  --rect-toggle-size: 34px;

  --rect-shadow-panel: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
  --rect-shadow-panel-hover: 0 30px 60px -12px rgba(0, 0, 0, 0.9);
  --rect-shadow-toggle: 0 4px 16px rgba(0, 0, 0, 0.12);

  --rect-motion-menu: 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  --rect-motion-nav: 0.2s ease;
  --rect-motion-toggle: 0.25s ease;
  --rect-motion-spring: 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);

  --rect-z-menu: 1;
  --rect-z-panel: 2;
  --rect-z-edge: 25;
  --rect-z-toggle: 30;
}
```

- [ ] **C1.2** Do **not** hardcode hex in components if a token exists — use `var(--rect-*)`.  
- [ ] **C1.3** Optional: small node script `scripts/tokens-to-css.mjs` that reads JSON → writes CSS (nice-to-have; hand-written OK if values match 1:1).  
- [ ] **C1.4** Document in comment at top of `tokens.css`: source file path in monorepo.

### C2. Fonts

- [ ] **C2.1** In `global.css` or `main.tsx`:

```ts
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/900.css";
```

- [ ] **C2.2** `font-family: Inter, system-ui, sans-serif` on shell.  
- [ ] **C2.3** No required Google Fonts `<link>` in production `index.html`.

### C3. Reset

- [ ] **C3.1** Box-sizing border-box; margin 0 padding 0 on `*`.  
- [ ] **C3.2** `html, body, #root { height: 100%; }`  
- [ ] **C3.3** **Must NOT** set `user-select: none` on `body`.  
- [ ] **C3.4** Body background `var(--rect-chrome-bg)`; default text white only on chrome (panel sets its own color).

---

## 5. Phase D — Feature module contract & registry

### D1. Types (`shell/feature-types.ts`)

- [ ] **D1.1** Define:

```ts
export type NavGroup = "primary" | "footer";

export type FeatureIconName =
  | "overview"
  | "projects"
  | "analytics"
  | "team"
  | "settings"
  | "profile"
  | "logout";

export interface FeatureModule {
  /** Stable id — used in URLs and tests */
  id: string;
  title: string;
  /** Optional; unused in P0 UI but field exists for P1 i18n */
  titleAr?: string;
  icon: FeatureIconName;
  order: number;
  navGroup: NavGroup;
  /** Absolute path from root, e.g. /projects */
  routePath: string;
  enabled: boolean;
  /**
   * Lazy loader for the page component default export.
   * P0: all point to ShellEmptyState wrapper.
   */
  load: () => Promise<{ default: React.ComponentType }>;
}
```

- [ ] **D1.2** Export type-only; no runtime logic.

### D2. Per-feature `index.ts` (P0 stubs)

For each of: `overview`, `projects`, `analytics`, `team`, `settings`:

- [ ] **D2.1** Export `xxxFeature: FeatureModule` with correct `order` (10, 20, 30, 40, 50).  
- [ ] **D2.2** `routePath`: `/`, `/projects`, `/analytics`, `/team`, `/settings` — **overview owns `/`**.  
- [ ] **D2.3** `load: () => import("@/shell/ShellEmptyState")` **or** thin local file that re-exports empty state with a prop — empty state must receive `featureId` / title via router context or wrapper.  

**Preferred pattern for empty state with title:**

```ts
// features/projects/index.ts
load: () => import("./ProjectsEmpty"),
// ProjectsEmpty.tsx
export default function ProjectsEmpty() {
  return <ShellEmptyState featureId="projects" title="Projects" />;
}
```

Minimal files allowed; no stats UI.

### D3. Footer items

- [ ] **D3.1** Profile & Logout as `FeatureModule` with `navGroup: "footer"`, paths `/profile`, `/logout`.  
- [ ] **D3.2** Logout in P0 is **UI only** (navigates to empty state or `#` with button look) — no real auth. Label remains “Logout”.  
- [ ] **D3.3** orders: profile 900, logout 910.

### D4. Registry (`shell/registry.ts`)

- [ ] **D4.1** Explicit import list **or** `import.meta.glob("../features/*/index.ts", { eager: true })` filtering out `_template`.  
- [ ] **D4.2** Functions:

```ts
export function getAllFeatures(): FeatureModule[]
export function getEnabledFeatures(): FeatureModule[]
export function getNavFeatures(group: NavGroup): FeatureModule[]
export function getFeatureByPath(pathname: string): FeatureModule | undefined
export function getFeatureById(id: string): FeatureModule | undefined
```

- [ ] **D4.3** Sort by `order` ascending.  
- [ ] **D4.4** Enabled filter: `enabled === true`.  
- [ ] **D4.5** Unit tests: ordering, filtering disabled, path match for `/` and `/projects`.

### D5. Icons map

- [ ] **D5.1** Map demo metaphors to lucide:  
  - overview → `LayoutGrid`  
  - projects → `Folder`  
  - analytics → `BarChart3`  
  - team → `Users`  
  - settings → `Settings`  
  - profile → `User`  
  - logout → `LogOut`  
- [ ] **D5.2** Stroke width ~2; size 22px; `currentColor`.

---

## 6. Phase E — Shell components (GUI)

Implement to match demo. Use CSS modules or a single `shell.css` scoped under `.rect-app`.

### E1. `AppShell`

- [ ] **E1.1** Props: `collapsed: boolean`, `onToggle: () => void`, `children` (outlet).  
- [ ] **E1.2** Root class `rect-app` + `rect-app--collapsed` when collapsed.  
- [ ] **E1.3** Layout: flex row, gap `var(--rect-app-gap)`, height calc(100% - padding).  
- [ ] **E1.4** Body padding applied on outer wrapper in `App` or shell root.  
- [ ] **E1.5** Renders `SideNav` + `MainPanel`.

### E2. `SideNav`

- [ ] **E2.1** Logo block:  
  - expanded: text `rectangle` (class logo-full)  
  - collapsed: `R` (logo-short)  
  - font-weight 900, size per tokens, color white, no flashy animation  
- [ ] **E2.2** Primary nav: `getNavFeatures("primary")` → `SideNavItem`  
- [ ] **E2.3** Spacer `flex: 1`  
- [ ] **E2.4** Footer nav: `getNavFeatures("footer")` with slightly reduced opacity per demo  
- [ ] **E2.5** Width transition 160 ↔ 52  
- [ ] **E2.6** `aria-label="Main"` on `<nav>` or `<aside>`

### E3. `SideNavItem`

- [ ] **E3.1** Use `NavLink` from react-router (`end` prop true for `/`).  
- [ ] **E3.2** Active class matches demo active styles.  
- [ ] **E3.3** Hover styles per tokens.  
- [ ] **E3.4** Collapsed: hide label (visually + `aria` still has accessible name via `aria-label={title}`).  
- [ ] **E3.5** min-height 44px expanded.

### E4. `MainPanel`

- [ ] **E4.1** White bg, 4px black border, radius 32px, panel shadow, padding per tokens.  
- [ ] **E4.2** `position: relative`, flex column, `flex: 1`, `min-width: 0`.  
- [ ] **E4.3** Hover shadow deepen.  
- [ ] **E4.4** Contains: `EdgeHoverZone`, `NavToggle`, then content column with optional header slot + `<Outlet />`.  
- [ ] **E4.5** Panel header for P0: title from active feature (`useLocation` + registry) + badge pill with feature title or “Rectangle”.  
- [ ] **E4.6** Double-click left 40px of panel toggles collapse (parity with demo).

### E5. `NavToggle`

- [ ] **E5.1** Circular button, 34px, left -16px, vertically centered.  
- [ ] **E5.2** Hidden until edge hover / focus-visible / when collapsed (match demo opacity rules).  
- [ ] **E5.3** `aria-expanded={!collapsed}`, `aria-controls` pointing at nav id.  
- [ ] **E5.4** Chevron rotates 180° when collapsed.  
- [ ] **E5.5** Keyboard: Enter/Space.  
- [ ] **E5.6** type="button".

### E6. `EdgeHoverZone`

- [ ] **E6.1** Absolute left hit area; click toggles.  
- [ ] **E6.2** Does not block panel content interactions (width ~32px).

### E7. `ShellEmptyState`

- [ ] **E7.1** Centered in panel content area.  
- [ ] **E7.2** Design-consistent soft well (card bg + border + radius 16) — **not** the demo hatch chart with emoji if it looks non-prod; use clean empty state:  
  - Title: feature title  
  - Short text: “This module is not implemented yet.”  
  - Optional mono id badge  
- [ ] **E7.3** No fake revenue metrics.

### E8. Collapse state persistence (production polish)

- [ ] **E8.1** Persist collapsed boolean in `localStorage` key `rectangle.shell.collapsed`.  
- [ ] **E8.2** Read on init; default `false`.  
- [ ] **E8.3** SSR-safe: guard `typeof window !== "undefined"` (Vite SPA still good practice).

### E9. Responsive

- [ ] **E9.1** Implement `@media (max-width: 768px)` and `480px` behaviors from design system §9 (column layout, full-width menu wrap, reduced padding/radius).  
- [ ] **E9.2** Toggle still usable on mobile.

### E10. Visual QA checklist (manual)

Compare side-by-side with `design/demo/shell.html`:

- [ ] Chrome bg matches `#0b0b0b`  
- [ ] Panel border 4px black  
- [ ] Panel radius ~32px desktop  
- [ ] Logo weight visually black/heavy white  
- [ ] Nav idle opacity ~50% white  
- [ ] Active/hover pills visible  
- [ ] Shadow deep under panel  
- [ ] Collapse animation smooth ~0.4s  
- [ ] No Google font flash required  

---

## 7. Phase F — Router & app bootstrap

### F1. Router

- [ ] **F1.1** `createBrowserRouter` with layout route:

```ts
{
  path: "/",
  element: <AppShellLayout />, // shell + outlet
  children: [
    ...enabledFeatures.map(f => ({
      path: f.routePath === "/" ? undefined : f.routePath.slice(1),
      index: f.routePath === "/",
      lazy: async () => {
        const mod = await f.load();
        return { Component: mod.default };
      },
    })),
    { path: "*", element: <ShellEmptyState featureId="unknown" title="Not found" /> },
  ],
}
```

(Adjust React Router API to v6/v7 idiomatic `lazy` or `React.lazy` + `Suspense` — pick one style and use consistently.)

- [ ] **F1.2** Suspense fallback: subtle centered “Loading…” inside panel (not full-page white flash of unstyled content).  
- [ ] **F1.3** Unknown paths show not-found empty state inside shell (shell still visible).

### F2. `main.tsx`

- [ ] **F2.1** `createRoot`, `StrictMode`, import `global.css`.  
- [ ] **F2.2** Render `<App />`.  
- [ ] **F2.3** No `console.log` spam in production path (remove demo console.log).

### F3. Error boundary (production-ready)

- [ ] **F3.1** Simple `RouteErrorBoundary` or router `errorElement` showing friendly message inside panel.  
- [ ] **F3.2** Does not crash entire chrome away if a lazy import fails.

---

## 8. Phase G — Quality gates

### G1. Tests (Vitest + Testing Library)

Minimum tests:

- [ ] **G1.1** `registry.test.ts` — order, enabled filter, getByPath `/`  
- [ ] **G1.2** `AppShell.test.tsx` — renders logo text “rectangle”  
- [ ] **G1.3** Toggle test — click toggle → collapsed class present → logo shows R (getByText)  
- [ ] **G1.4** Nav test — click Projects → URL `/projects` (MemoryRouter)  
- [ ] **G1.5** Ensure tests run headless in CI-like `vitest run`

### G2. Lint & types

- [ ] **G2.1** `npm run typecheck` clean  
- [ ] **G2.2** `npm run lint` clean (`max-warnings 0`)  
- [ ] **G2.3** No `any` without justification comment  
- [ ] **G2.4** No unused exports that eslint flags

### G3. Build

- [ ] **G3.1** `npm run build` produces `apps/web/dist`  
- [ ] **G3.2** `npm run start` with `PORT=3000` serves SPA; client router works (try direct `/projects` refresh — needs SPA fallback: `serve -s` handles this)

### G4. Accessibility pass

- [ ] **G4.1** One `<main>` landmark for panel content  
- [ ] **G4.2** Nav has accessible name  
- [ ] **G4.3** Toggle has name + pressed/expanded state  
- [ ] **G4.4** Focus visible on interactive elements (do not remove outlines without replacement)  
- [ ] **G4.5** Color contrast: panel text `#111` on `#fff` OK; nav idle may be low opacity by design (document as intentional)

---

## 9. Phase H — Railway & deploy config

### H1. Files to add

- [ ] **H1.1** Root `railway.toml` **or** `apps/web/railway.toml`:

```toml
[build]
builder = "NIXPACKS"
buildCommand = "npm ci --prefix apps/web && npm run build --prefix apps/web"

[deploy]
startCommand = "npm run start --prefix apps/web"
healthcheckPath = "/"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
```

(If Railway root directory is set to `apps/web` in dashboard, use simpler commands without prefix — **document both** in `apps/web/README.md`.)

- [ ] **H1.2** `apps/web/README.md`:  
  - Local dev  
  - Build  
  - Railway: set Root Directory `apps/web` **OR** use root railway.toml  
  - Required env: `PORT` (Railway injects)  
  - No secrets required for P0  

- [ ] **H1.3** `nixpacks.toml` only if needed after first deploy failure.  

- [ ] **H1.4** Ensure `serve` is a **dependency** (not only devDependency) if used in `start` on Railway production install — **critical**: Railway may run `npm ci --omit=dev`. Therefore:

**Lock decision:** put `serve` in **`dependencies`**, not devDependencies.

### H2. SPA routing on refresh

- [ ] **H2.1** Confirm `serve -s` (single page) so `/projects` deep link works.  
- [ ] **H2.2** Document this requirement.

### H3. Owner manual steps (not blocked on agent)

Document clearly for product owner (checklist in README):

1. Railway → New Project → Deploy from GitHub → `Ahmed-Sleem/rectangle`  
2. Root Directory: `apps/web` (recommended)  
3. Generate domain  
4. Verify auto-deploy on push  

Agent cannot complete Railway OAuth in this environment — config must be complete enough that owner only clicks.

---

## 10. Phase I — Documentation updates in monorepo

- [ ] **I1** Root `README.md`: status “Shell app in progress/done”; how to run `apps/web`.  
- [ ] **I2** `docs/ARCHITECTURE.md`: mark P0 items done when finished (small status line).  
- [ ] **I3** `docs/plans/P0_SHELL_APP.md`: this file — tick boxes during execution.  
- [ ] **I4** Do not commit `_working_docs` or secrets.

---

## 11. Phase J — Git

- [ ] **J1** Review `git status` — only intended files.  
- [ ] **J2** Commit message style:

```text
feat(web): production shell app with feature registry (P0)

Pixel-faithful Rectangle chrome, empty feature routes, Railway-ready
start command, tests and lint gates.
```

- [ ] **J3** Push `main`.  
- [ ] **J4** Verify GitHub shows `apps/web` tree.

---

## 12. Execution rules (after plan confirmation)

When product owner says **confirm / go / execute plan**:

1. Open this file and work **section by section**.  
2. After each phase (A→J), run relevant checks before continuing.  
3. On failure: fix before next phase; do not pile broken steps.  
4. Do not expand scope into feature pages.  
5. If a step is blocked (e.g. no Node), install tooling first (still part of plan).  
6. Prefer editing existing design tokens over inventing new colors.  
7. Production-ready means: strict TS, lint clean, tests pass, build pass, a11y basics, SPA serve, no demo junk.

---

## 13. Risk register & mitigations

| Risk | Mitigation |
|------|------------|
| Visual drift from demo | Side-by-side QA checklist §E10; tokens from JSON |
| Railway omits devDependencies | `serve` in dependencies; document |
| React Router v7 API confusion | Pin version; one lazy pattern; test nav |
| Overbuilding features | Scope lock §0.2; empty state only |
| Monorepo path issues on Railway | Document root directory; test build with prefix |
| localStorage SSR | SPA only; window guard |
| Font licensing/network | `@fontsource/inter` self-hosted |

---

## 14. Acceptance test script (run before calling P0 done)

```bash
cd /home/user/rectangle/apps/web
node -v                    # >= 20
npm ci
npm run typecheck
npm run lint
npm test
npm run build
PORT=4173 npm run start &  # or start after build
sleep 2
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4173/
# expect 200
# manual: open browser, toggle nav, click Projects, refresh /projects
```

- [ ] All automated commands green  
- [ ] Manual shell interactions verified  
- [ ] Deep link refresh works  

---

## 15. Post-P0 (NOT part of this plan — do not execute now)

- P1: Real Overview “Today” empty layout with widgets structure  
- P1: Feature `_template` generates real page scaffolding  
- P1: i18n + RTL shell flip  
- P2: API + auth  
- Railway connect (owner) once P0 merged  

---

## 16. Plan audit log (self-review)

Performed after first full draft. Improvements applied in this same file.

### 16.1 Audit questions

| # | Question | Result |
|---|----------|--------|
| 1 | Is scope limited to shell + registry without feature pages? | **Yes** — §0.1–0.2, empty state only |
| 2 | Can an executor follow without guessing stack? | **Yes** — Vite/React/TS/RR/lucide/fontsource/vitest |
| 3 | Are design tokens binding? | **Yes** — §4 from `shell.tokens.json` |
| 4 | Is Railway production install safe (`omit=dev`)? | **Yes** — `serve` in `dependencies` (§9 H1.4) |
| 5 | SPA deep links? | **Yes** — `serve -s` (§9 H2) |
| 6 | A11y minimum? | **Yes** — §6 E5, §8 G4 |
| 7 | Demo footgun `user-select: none` banned? | **Yes** — §0.1 #12, §4 C3.3 |
| 8 | Fake dashboard metrics banned? | **Yes** — §0.4 |
| 9 | Tests defined? | **Yes** — §8 G1 |
| 10 | Owner Railway OAuth blocked handled? | **Yes** — config + manual steps only |
| 11 | Confirmation gate before code? | **Yes** — §17 |
| 12 | Checkbox density for step-by-step execution? | **Yes** — 100+ steps |

### 16.2 Gaps found in draft → fixed below

| Gap | Fix |
|-----|-----|
| No pinned dependency strategy | §16.3 |
| No complete file inventory | §16.4 |
| No env example | §16.5 |
| No rollback / stop conditions | §16.6 |
| React Router API ambiguity | §16.7 (pinned pattern) |
| Base path | §16.8 |
| Execution order diagram | §16.9 |

### 16.3 Dependency pinning strategy

- [ ] Use **exact or `^` ranges** as Vite scaffold generates; after first green build run `npm ls` and commit **`package-lock.json`**.  
- [ ] **Always commit the lockfile** — Railway must use `npm ci`.  
- [ ] Do not upgrade React majors mid-P0.  
- [ ] Pin `react-router-dom` to v6.28+ or v7.x as resolved by npm at scaffold time; document resolved version in `apps/web/README.md`.

### 16.4 Complete file inventory (create or replace)

**Create:**

```text
apps/web/package.json
apps/web/package-lock.json          # via npm install
apps/web/vite.config.ts
apps/web/vitest.config.ts
apps/web/tsconfig.json
apps/web/tsconfig.app.json
apps/web/tsconfig.node.json
apps/web/eslint.config.js
apps/web/index.html
apps/web/README.md
apps/web/public/favicon.svg
apps/web/src/main.tsx
apps/web/src/vite-env.d.ts
apps/web/src/app/App.tsx
apps/web/src/app/router.tsx
apps/web/src/app/providers.tsx
apps/web/src/app/AppShellLayout.tsx  # wires collapsed state + shell + outlet
apps/web/src/shell/feature-types.ts
apps/web/src/shell/registry.ts
apps/web/src/shell/registry.test.ts
apps/web/src/shell/AppShell.tsx
apps/web/src/shell/AppShell.test.tsx
apps/web/src/shell/SideNav.tsx
apps/web/src/shell/SideNavItem.tsx
apps/web/src/shell/MainPanel.tsx
apps/web/src/shell/NavToggle.tsx
apps/web/src/shell/EdgeHoverZone.tsx
apps/web/src/shell/ShellEmptyState.tsx
apps/web/src/shell/icons.tsx
apps/web/src/shell/shell.css
apps/web/src/shell/index.ts
apps/web/src/shared/styles/tokens.css
apps/web/src/shared/styles/reset.css
apps/web/src/shared/styles/global.css
apps/web/src/shared/lib/cn.ts
apps/web/src/features/_template/index.ts
apps/web/src/features/_template/README.md
apps/web/src/features/overview/index.ts
apps/web/src/features/overview/OverviewEmpty.tsx
apps/web/src/features/projects/index.ts
apps/web/src/features/projects/ProjectsEmpty.tsx
apps/web/src/features/analytics/index.ts
apps/web/src/features/analytics/AnalyticsEmpty.tsx
apps/web/src/features/team/index.ts
apps/web/src/features/team/TeamEmpty.tsx
apps/web/src/features/settings/index.ts
apps/web/src/features/settings/SettingsEmpty.tsx
apps/web/src/features/profile/index.ts
apps/web/src/features/profile/ProfileEmpty.tsx
apps/web/src/features/logout/index.ts
apps/web/src/features/logout/LogoutEmpty.tsx
railway.toml                        # root OR apps/web — pick one, document
package.json                        # root convenience scripts
```

**Update:**

```text
.gitignore
README.md
docs/ARCHITECTURE.md          # P0 status line only
docs/plans/P0_SHELL_APP.md    # checkboxes during execution
```

**Delete (Vite defaults):** counter demo css/svg/assets as listed in §2 A5.

### 16.5 Env

- [ ] Add `apps/web/.env.example`:

```bash
# Railway injects PORT. Local defaults are fine.
# PORT=3000
# Optional future: VITE_API_URL=
```

- [ ] No required secrets for P0.  
- [ ] Never commit `.env`.

### 16.6 Stop conditions & rollback

**Stop and ask owner if:**

- Node 20 cannot be installed in environment  
- Railway requires paid plan owner doesn’t have (config still ships)  
- Design token file missing from repo  

**Rollback:**

```bash
git revert <p0-commit-sha>   # or reset if not pushed — prefer revert on main
```

P0 must not delete `design/` or `research/`.

### 16.7 React Router pattern (locked for P0)

Use **React Router 6.4+ data API**:

- `createBrowserRouter` + `RouterProvider`  
- Layout route element = `AppShellLayout`  
- Child routes use:

```tsx
{
  path: "projects",
  lazy: async () => {
    const { default: Component } = await projectsFeature.load();
    return { Component };
  },
}
```

- Wrap lazy in router-level handling; add `<Suspense>` inside layout if required by chosen RR version.  
- For unit tests: `createMemoryRouter` + `RouterProvider`.

### 16.8 Base path

- [ ] Assume app hosted at domain root `/` (Railway default).  
- [ ] `vite.config.ts` `base: '/'`.  
- [ ] Do not use GitHub Pages subpath unless owner requests.

### 16.9 Execution order (strict)

```text
1 Preconditions
2 Phase A scaffold
3 Phase B folders
4 Phase C tokens/css/font
5 Phase D contract+registry+feature stubs
6 Phase E shell GUI
7 Phase F router bootstrap
8 Phase G quality gates
9 Phase H railway
10 Phase I docs
11 Phase J git push
12 §14 acceptance script
```

Do not start E before C. Do not start F before D+E shell layout exists. Do not push before G green.

### 16.10 Final readiness statement

This plan is **execution-ready** for a production-quality **shell-only** app:

- Stack pinned in spirit (Vite React TS)  
- Architecture matches `docs/ARCHITECTURE.md` Option A  
- GUI matches approved design system  
- Feature system ready for P1 pages without rewrite  
- Deploy path defined for Railway  
- Tests, lint, a11y, SPA fallback included  
- Scope boundaries prevent declutter  

---

## 17. Confirmation block

**Product owner:** reply with one of:

- `CONFIRM P0` — execute this plan as checklist, no scope creep  
- `CONFIRM P0 WITH CHANGES:` + bullet list of edits  
- `REVISE` + what to change  

Until confirmation, **do not** scaffold `apps/web`.

---

*Sources: `design/demo/shell.html`, `design/DESIGN_SYSTEM.md`, `design/tokens/shell.tokens.json`, `docs/ARCHITECTURE.md`.*
