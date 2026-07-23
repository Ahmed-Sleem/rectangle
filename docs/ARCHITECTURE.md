# Rectangle — Architecture discussion

Two goals:

1. **Always-on preview** — GitHub → Railway auto-deploy so every push is testable online.  
2. **Modular product** — one main **shell** (your dark chrome + white rectangle + right AI side panel) that **discovers and loads features** so we can add pages without cluttering the core.

---

## 1. Verdict (short)

| Idea | Verdict |
|------|---------|
| Railway auto-deploy from this repo | **Yes — do it.** Perfect for a design/product loop. |
| Shell loads independent features | **Yes — core idea is correct.** |
| Full micro-frontends (Module Federation, separate deploys per feature) | **Not yet.** Too much ops for one product team. |
| Best fit now | **Modular monolith frontend**: one app, **feature modules** with a strict contract + **lazy load** + optional **manifest**. Feels “plug-in”; stays easy to develop. |

Your mental model maps cleanly to industry practice:

```text
Shell (always on)
  ├── owns left navigation chrome
  ├── owns right universal AI assistant panel (not a feature/page)
  ├── reads feature registry / manifest
  ├── builds nav from enabled features
  └── loads active feature UI into the main canvas

Feature: projects   ──┐
Feature: risks      ──┼── developed separately, same rules
Feature: schedule   ──┘
```

That is **connected** (shared design system, auth, router, data contracts) and **disconnected** (feature folders don’t import each other’s guts; shell doesn’t hardcode feature internals).

Hard shell split:

- **Left menu:** shell-owned; generated from enabled `FeatureModule` entries so each instance can expose a different set/order of pages. The menu collapse control is a circular bottom-left control inside the main canvas, opposite the AI launcher, with black/inner border so it remains visible on the white surface.
- **Main canvas:** shell-owned white Rectangle surface; only this area changes when routes/features open.
- **Right AI panel:** shell-owned universal assistant; always part of the app chrome, never implemented as a feature route/page. Expanded = right mini-rectangle; collapsed = circular assistant icon in the top-right of the main canvas, with no reserved side-panel width.

---

## 2. Railway auto-deploy

### What Railway gives you

- Connect GitHub repo `Ahmed-Sleem/rectangle`
- On every push to `main` (or a branch): clone → build → run → public HTTPS URL  
- Optional: Postgres / Redis as extra services later  
- Env vars in dashboard (`VITE_*` for public, secrets server-side only)

### Recommended deploy shape (phase 1)

**One Railway service** = the web app (static SPA or Node server).

```text
Railway Project: rectangle
└── Service: web   ← GitHub main, root or apps/web
```

Later (only when needed):

```text
├── Service: web
├── Service: api
├── Postgres
└── Redis (jobs / realtime)
```

Do **not** start with one Railway service per feature. That is micro-frontend ops.

### Practical setup (you click in Railway UI)

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** → `rectangle`  
2. Set **Root Directory** to `apps/web` once the app exists (or repo root if single package)  
3. Build / start (Vite example):

   | Setting | Value |
   |---------|--------|
   | Build | `npm ci && npm run build` |
   | Start / output | Static: `npx serve -s dist -l $PORT` **or** use Railway static + `PORT` |
   | Watch paths | `apps/web/**` (optional, monorepo) |

4. Enable **auto-deploy** on `main`  
5. Optional: `PR` / branch deploys for experimental features  

### Config as code (optional, good hygiene)

`railway.toml` or `nixpacks` detection is enough early. A Dockerfile is fine if builds get picky.

### What to deploy first

1. **Design shell only** (React rebuild of `design/demo/shell.html`) — proves Railway + design  
2. Then empty feature modules behind nav  
3. Then real data/API  

---

## 3. Architecture options for “main page loads features”

### Option A — Feature modules (recommended now)

**One Vite + React app.** Features are folders that **self-register**.

```text
apps/web/
  src/
    shell/                 # chrome only: layout, nav chrome, toggle, providers
      AppShell.tsx
      SideNav.tsx
      MainPanel.tsx
    shared/                # design tokens, ui kit, i18n, api client, auth
      ui/
      lib/
    features/
      overview/
        index.ts           # public API of the feature
        routes.tsx
        pages/OverviewPage.tsx
        api/               # optional
      projects/
        index.ts
        routes.tsx
        pages/
      risks/
        ...
    app/
      main.tsx
      router.tsx           # imports feature route tables
      registry.ts          # collects features
```

**Feature contract** (every feature exports the same shape):

```ts
// features/projects/index.ts
import type { FeatureModule } from "@/shell/feature-types";

export const projectsFeature: FeatureModule = {
  id: "projects",
  title: "Projects",
  titleAr: "المشاريع",
  icon: "folder",
  order: 20,
  navGroup: "primary",          // primary | footer
  routePath: "/projects",
  // lazy page — shell never imports page internals eagerly
  load: () => import("./pages/ProjectsPage"),
  // optional: permissions, flags, badge counts later
  enabled: true,
};
```

**Shell behavior:**

1. `registry` imports all `features/*/index.ts` (or glob-import)  
2. Sort by `order`, filter `enabled`  
3. Build side nav from registry  
4. React Router: one parent layout (shell) + child routes from each feature’s `routePath` + `React.lazy(load)`  
5. Unknown routes → empty state inside the white panel  

**Adding a feature** = new folder + one line in registry (or zero lines if using `import.meta.glob`). No edits to shell layout CSS.

#### “Connected” vs “disconnected” in this model

| | Meaning |
|--|---------|
| **Connected** | Features use shared UI, tokens, auth session, API client, i18n; deep links work; one deploy |
| **Disconnected** | Feature A must not import Feature B’s private files; only shared contracts; features can be toggled off |

This matches “create each feature separately” without multi-repo pain.

---

### Option B — Manifest-driven plugins (recommended next step)

Same as A, but discovery is data-driven:

```json
// public/features.manifest.json  (or generated at build)
{
  "features": [
    { "id": "overview", "path": "/overview", "entry": "./features/overview/index.ts", "nav": true },
    { "id": "projects", "path": "/projects", "entry": "./features/projects/index.ts", "nav": true }
  ]
}
```

Build step globs folders → writes manifest → shell reads it.

**Why later:** slightly more machinery; great when non-devs toggle modules or you load remote packages.

---

### Option C — True micro-frontends (Module Federation / separate deploys)

```text
shell.railway.app
projects.railway.app  → remoteEntry.js
risks.railway.app
```

Shell loads remotes at **runtime**.

| Pros | Cons |
|------|------|
| Independent deploy per feature | Version hell (React twice, shared deps) |
| Multiple teams | Harder local dev, debugging, types |
| | Slower iteration for a small team |
| | Overkill for Rectangle v1 |

**Use only if** multiple teams ship features on different cadences or third parties plug into your shell. **Not now.**

---

### Option D — iframe “pages”

Each feature is a full HTML page in an iframe.

| Pros | Cons |
|------|------|
| Hard isolation | Ugly UX, auth duplication, no shared design easily |
| | Breaks the single “white rectangle” feel |

**Avoid** for core product UI.

---

## 4. Best organized structure for Rectangle (opinionated)

```text
rectangle/                          # monorepo root (already exists)
├── design/                         # design source of truth (done)
├── research/                       # product intelligence (done)
├── docs/
│   ├── ARCHITECTURE.md             # this file
│   └── NAMING.md
├── apps/
│   └── web/                        # Vite + React + TS  ← Railway deploys this
│       ├── package.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── app/                # bootstrap + router
│           ├── shell/              # ONLY chrome (your demo)
│           ├── shared/             # ui kit, tokens, hooks, api
│           └── features/           # ONE folder per capability
│               ├── overview/
│               ├── projects/
│               ├── tasks/
│               ├── schedule/
│               ├── risks/
│               ├── documents/
│               ├── team/
│               ├── settings/
│               └── _template/      # copy-paste starter feature
└── packages/                       # optional later
    ├── ui/                         # if design system extracted
    └── config/                     # eslint/tsconfig
```

### Rules that prevent declutter

1. **Shell never knows feature business logic** — only registry fields.  
2. **Features never import other features** — only `@/shared` and their own tree.  
3. **Cross-feature needs** → promote to `shared/` or a small event/bus / URL query (e.g. open project id).  
4. **One public export** per feature: `index.ts` (`FeatureModule`).  
5. **Routes live with the feature**, not a giant central routes file (central file only *aggregates*).  
6. **Design tokens** from `design/tokens/shell.tokens.json` → CSS variables in `shared/styles`.  
7. **Flags** `enabled: false` hide nav + routes without deleting code.  

---

## 5. Runtime picture

```text
Browser
  └── Shell (layout + nav + providers + AI assistant panel)
        ├── AuthProvider (later)
        ├── I18nProvider (en/ar + RTL later)
        ├── QueryClient (data)
        ├── AiAssistantPanel (shell-owned; real model adapter later)
        └── <Outlet />  → lazy Feature page inside MainPanel
              ├── /           → overview
              ├── /projects   → projects
              └── /risks/:id  → risks
```

**Data later (same idea):**

```text
Feature UI → shared/api → backend
```

Backend can stay modular (`modules/projects`, `modules/risks`) without the frontend needing Federation.

---

## 6. Connected / disconnected — two useful meanings

### A) Module coupling (what you described)

| Mode | How |
|------|-----|
| Connected | Feature on, in registry, uses shared session & API |
| Disconnected | Feature off (`enabled: false`) or developed in isolation with Storybook / route-only dev |

Local DX: run full app, or `FEATURES=projects,overview` env to load a subset.

### B) Network online / offline (field construction)

Separate concern (from research offline stack):

- Shell always loads  
- Features that need network degrade gracefully  
- Later: WatermelonDB / sync queue for field features  

Don’t mix “feature plugin” and “offline sync” into one abstraction on day one — same shell, different layers.

---

## 7. How a new feature is added (developer experience)

```bash
cp -r apps/web/src/features/_template apps/web/src/features/approvals
# edit index.ts: id, title, path, icon
# implement pages/ApprovalsPage.tsx
# registry auto-picks via import.meta.glob — OR add one import
git push   # Railway redeploys; /approvals live
```

Target: **&lt; 15 minutes** from idea to URL on Railway for a stub page.

---

## 8. Stack recommendation (aligned with design + research)

| Layer | Choice | Why |
|-------|--------|-----|
| App | **Vite + React + TypeScript** | Fast HMR, simple Railway static/Node deploy |
| Router | **React Router 7** | Nested layout = shell + feature outlets |
| Style | **CSS variables from tokens** + `design/GUI_SIZING_RULES.md` | Match shell and keep dense desktop GUI consistent |
| Icons | lucide-react outline | Match stroke demo |
| Data | TanStack Query when API exists | |
| i18n | i18next when AR lands | RTL flips shell |
| Deploy | **Railway ← GitHub main** | Your requirement |

Next.js is fine later for SEO/marketing site; **app shell SPA on Vite is enough** for the product UI and simpler on Railway at first.

---

## 9. What I would *not* do

- One mega `App.tsx` with all pages  
- Separate git repo per feature (now)  
- Module Federation day one  
- iframe features  
- Deploying the raw `design/demo/shell.html` as the product (demo only)  
- Putting feature business logic inside `shell/`  

---

## 10. Phased plan

| Phase | Deliverable |
|-------|-------------|
| **P0** | `apps/web` shell = pixel-faithful demo; Railway auto-deploy |
| **P1** | Feature registry + 2–3 stub features (Overview, Projects, Settings) |
| **P2** | Shared UI kit; real nav IA from research; lazy routes |
| **P3** | API service (same or second Railway service); auth |
| **P4** | Offline-capable field features if needed |
| **P5** | Only if needed: extract a feature to federated remote |

---

## 11. Answer to “is that suitable?”

**Yes.**  
Shell + independently developed features is the right product architecture for Rectangle.  

Implement it as a **feature-module modular monolith** with a **registry contract** and **Railway continuous deploy**.  
Reserve full micro-frontends for a future scale problem you don’t have yet.

---

## 12. Decision checklist (for product owner)

Detailed plan: **[plans/P0_SHELL_APP.md](./plans/P0_SHELL_APP.md)**.

### P0 status: **COMPLETE**

- [x] `apps/web` Vite + React + TypeScript shell  
- [x] Design system shell (collapse, tokens, empty feature routes)  
- [x] Feature registry (`import.meta.glob`)  
- [x] Tests / lint / typecheck / production build  
- [x] Railway config (`railway.toml` + `apps/web` docs)  
- [ ] Owner connects Railway → GitHub (manual)  

### Next (P1)

- [ ] Real Overview / feature page content  
- [ ] i18n + RTL  

---

*Related: [../design/DESIGN_SYSTEM.md](../design/DESIGN_SYSTEM.md) · [../research/synthesis/06-build-recommendations.md](../research/synthesis/06-build-recommendations.md)*
