# @rectangle/web

Rectangle application shell (P0): dark chrome + white work surface, feature registry, empty module routes.

## Requirements

- Node.js 20+

## Scripts

```bash
npm install
npm run dev          # http://localhost:5173
npm run build
npm run typecheck
npm run lint
npm test
npm run start        # serve dist on PORT (default 3000), SPA fallback
```

## Stack

- Vite 8 + React 19 + TypeScript (strict)
- React Router 7 (data router + lazy feature routes)
- Lucide icons, Inter via `@fontsource/inter`
- Vitest + Testing Library
- `serve` (production dependency) for Railway / static SPA

## Feature modules

Each feature lives under `src/features/<id>/` and exports a `FeatureModule` from `index.ts`.  
The shell discovers modules via `import.meta.glob` (see `src/shell/registry.ts`).

Copy `src/features/_template` to add a module. Do not import other features.

## Railway

**Option A — Root Directory = `apps/web` (recommended in dashboard)**

| Setting | Value |
|---------|--------|
| Root Directory | `apps/web` |
| Build | `npm ci && npm run build` |
| Start | `npm run start` |

**Option B — Repo root**

Use root `railway.toml` (build/start with `--prefix apps/web`).

Railway injects `PORT`. No secrets required for P0.

Deep links (e.g. `/projects`) require SPA fallback — provided by `serve -s`.

## Env

See `.env.example`. None required for P0.
