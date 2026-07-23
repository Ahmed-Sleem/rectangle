# @rectangle/web

Rectangle application shell (P0+ base GUI): dark chrome + white work surface, feature registry, page-specific browser titles, icon-only nav control, and a retractable AI assistant panel ready for a real model adapter.

## Requirements

- Node.js 20+

## Scripts

```bash
npm ci
npm run dev            # http://localhost:5173
npm run verify:deploy  # typecheck + lint + test + build
npm run verify         # alias for verify:deploy
npm run start          # serve dist on PORT (default 3000), SPA fallback
```

## Stack

- Vite 8 + React 19 + TypeScript (strict)
- React Router 7 (data router + lazy feature routes)
- i18next + react-i18next for Arabic/English shell localization
- Lucide icons, Inter via `@fontsource/inter`
- Vitest + Testing Library
- `serve` (**production dependency**) for Railway / static SPA

## Arabic / RTL foundation

The shell has an active i18n provider in `src/shared/i18n/`. It supports English and Arabic resources, persists the selected language in localStorage, and synchronizes `<html lang>` plus `<html dir>` for RTL/LTR behavior. Feature modules must provide both `title` and `titleAr` before production enablement.

## Shared UI primitives

Reusable production UI primitives live in `src/shared/ui/`. Feature pages should import from `@/shared/ui` and avoid local one-off styles for buttons, cards, form controls, tables, empty/loading/error states, modals, drawers, and toasts.

## Feature modules

Each feature lives under `src/features/<id>/` and exports a `FeatureModule` from `index.ts`.  
The shell discovers modules via `import.meta.glob` (see `src/shell/registry.ts`).

Instance-level feature availability, labels, order, and nav grouping are controlled by `src/app/feature-config.ts`. This keeps the shell customizable per company without editing shell components.

Copy `src/features/_template` to add a module. Do not import other features.

The right AI panel is shell-owned (`src/shell/ai/`) so feature pages remain standalone and instances can customize feature availability without coupling pages to the assistant UI. Send controls stay disabled until a real model adapter is wired — no fake AI responses in production paths.

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
