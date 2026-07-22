# @rectangle/web

Rectangle application shell (P0): dark chrome + white work surface, feature registry, empty module routes.

## Requirements

- Node.js 20+

## Scripts

```bash
npm ci
npm run dev            # http://localhost:5173
npm run verify:deploy  # typecheck + lint + test + build
npm run start          # serve dist on PORT (default 3000), SPA fallback
```

## Stack

- Vite 8 + React 19 + TypeScript (strict)
- React Router 7 (data router + lazy feature routes)
- Lucide icons, Inter via `@fontsource/inter`
- Vitest + Testing Library
- `serve` (**production dependency**) for Railway / static SPA

## Feature modules

Each feature lives under `src/features/<id>/` and exports a `FeatureModule` from `index.ts`.  
The shell discovers modules via `import.meta.glob` (see `src/shell/registry.ts`).

Copy `src/features/_template` to add a module. Do not import other features.

## Railway (ready)

**Full guide:** [../../docs/DEPLOY_RAILWAY.md](../../docs/DEPLOY_RAILWAY.md)

**Recommended dashboard settings**

| Setting | Value |
|---------|--------|
| Root Directory | `apps/web` |
| Build | `npm ci --include=dev && npm run build` |
| Start | `npm run start` |
| Branch | `main` (auto-deploy on) |

Config file: [`railway.toml`](./railway.toml) in this folder.

`PORT` is injected by Railway. No secrets required for P0.

Deep links (`/projects`) need SPA fallback — provided by `serve -s` in `start`.

## Env

See [`.env.example`](./.env.example). None required for P0.
