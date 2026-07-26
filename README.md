# Rectangle

**Rectangle** is an AI-native construction / PMO product: bilingual (Arabic + English), field-aware, controls-aware — built to be clearer and faster than bolting chatbots onto yesterday’s tools.

I kept running into the same mess on real projects: schedules in one tool, costs in another, risks in a spreadsheet, drawings in WhatsApp, and executives asking for a status that was already wrong by the time it was pasted into a slide.

This repository is the **single home** for Rectangle: research, design system, and application code.

> *Every side of the project. One frame.*

---

## Quick start

### Web app

```bash
cd apps/web
npm ci
npm run dev
```

Open http://localhost:5173 — dark chrome + white rectangle shell, collapsible nav, localized feature routes.

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

More detail: [apps/web/README.md](./apps/web/README.md).

### API service

```bash
cd apps/api
npm ci
npm run verify
```

The API requires real environment configuration before serving production traffic: `DATABASE_URL` and `SESSION_JWT_SECRET`. It can also serve the built web app in the single-service deployment. More detail: [apps/api/README.md](./apps/api/README.md).

### Full local verification

```bash
./scripts/verify.sh
```

This is the single gate before any push. It runs both app suites (typecheck, lint, tests,
production build) and the repository-level deployment checks:

| Check | Guards against |
|---|---|
| `scripts/checks/token-snapshot.mjs` | Design token docs drifting from the shipped CSS |
| `scripts/checks/deploy-context.mjs` | An app importing files the Docker build does not copy |
| `scripts/checks/docker-build-sim.sh` | Image stages that fail to build from their own context |

The last two exist because the Dockerfile builds each app from a subset of the repository.
Code can compile locally, where the whole repo is present, and still fail the deploy.

### Railway

**Ready to connect** — step-by-step: [docs/DEPLOY_RAILWAY.md](./docs/DEPLOY_RAILWAY.md)

1. New Project → Deploy from GitHub → `Ahmed-Sleem/rectangle`
2. **Root Directory:** repository root (leave empty)
3. **Builder:** Dockerfile · **Dockerfile path:** `Dockerfile`
4. Start: `npm run start` · Healthcheck: `/health/live`
5. Add a PostgreSQL service and set `DATABASE_URL`, `SESSION_JWT_SECRET`, `APP_SECRET_KEY`, `NODE_ENV=production`
6. Generate domain · auto-deploy on `main`

One service serves the web app, the `/v1` API, and health routes.

Local parity check: `./scripts/verify.sh` — this reproduces the Docker build context and will
fail for the same reasons Railway would.

---

## Repository layout

```text
rectangle/
├── apps/web/                # Vite + React app shell and feature pages
├── apps/api/                # Fastify + PostgreSQL backend API
├── design/                  # Approved GUI + tokens
├── docs/                    # Architecture, naming, plans
├── research/                # Product intelligence
├── compose.yaml              # Local/company-style multi-container deployment
├── railway.toml
├── README.md
└── LICENSE
```

---

## Documentation

| Doc | Why |
|-----|-----|
| [apps/web/README.md](./apps/web/README.md) | Run / build / Railway for the web app |
| [apps/api/README.md](./apps/api/README.md) | Run / verify / configure the production API service |
| [design/DESIGN_SYSTEM.md](./design/DESIGN_SYSTEM.md) | GUI tokens & shell spec |
| [design/demo/shell.html](./design/demo/shell.html) | Original HTML design demo |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Shell + feature modules + Railway |
| [docs/PRODUCT_FEATURE_BLUEPRINT.md](./docs/PRODUCT_FEATURE_BLUEPRINT.md) | Complete feature/page blueprint for the ultimate Arabic-first construction PMO app |
| [docs/UI_UX_PRESENTATION_PLAN.md](./docs/UI_UX_PRESENTATION_PLAN.md) | User-visible UI/UX presentation plan and Tornix-inspired coverage guardrail |
| [docs/FEATURE_REUSE_RESEARCH.md](./docs/FEATURE_REUSE_RESEARCH.md) | GitHub/open-source reuse candidates and per-feature research register |
| [docs/MASTER_IMPLEMENTATION_PLAN.md](./docs/MASTER_IMPLEMENTATION_PLAN.md) | Step-by-step full-app implementation plan with tests/security/gates |
| [docs/MASTER_PLAN_AUDIT.md](./docs/MASTER_PLAN_AUDIT.md) | Audit of the master implementation plan and remaining proof spikes |
| [docs/plans/P0_SHELL_APP.md](./docs/plans/P0_SHELL_APP.md) | P0 execution plan |
| [docs/DEPLOY_RAILWAY.md](./docs/DEPLOY_RAILWAY.md) | **Railway multi-service Docker deploy checklist** |
| [docs/DEPLOY_DOCKER.md](./docs/DEPLOY_DOCKER.md) | Docker/Compose deployment model for hosted and company installs |
| [research/INDEX.md](./research/INDEX.md) | Research pack navigation |

---

## Status

| Phase | State |
|-------|--------|
| Competitive & OSS research | Complete (snapshot 2026-07-22) |
| Design direction | **Approved** |
| Product name | **Rectangle** |
| **P0 shell app** | **Done** — registry + localized routes, tests green |
| Projects page | **Started** — user-facing workspace page, backend API slice in progress |
| Backend API | **Started** — production Projects API, PostgreSQL schema, auth boundary, audit events, single-service web serving |
| Railway config | **Ready for web** — [docs/DEPLOY_RAILWAY.md](./docs/DEPLOY_RAILWAY.md) |
| Feature pages | In progress |
| Railway connect | Your step: connect GitHub (see deploy guide) |

---

## License

MIT — see [LICENSE](./LICENSE).  
Third-party products and trademarks remain their owners’.
