# Rectangle

**Rectangle** is an AI-native construction / PMO product: bilingual (Arabic + English), field-aware, controls-aware — built to be clearer and faster than bolting chatbots onto yesterday’s tools.

I kept running into the same mess on real projects: schedules in one tool, costs in another, risks in a spreadsheet, drawings in WhatsApp, and executives asking for a status that was already wrong by the time it was pasted into a slide.

This repository is the **single home** for Rectangle: research, design system, and application code.

> *Every side of the project. One frame.*

---

## Quick start (web shell)

```bash
cd apps/web
npm ci
npm run dev
```

Open http://localhost:5173 — dark chrome + white rectangle shell, collapsible nav, empty feature routes.

```bash
npm test && npm run lint && npm run typecheck && npm run build
npm run start   # production static serve on PORT (default 3000)
```

More detail: [apps/web/README.md](./apps/web/README.md).

### Railway

**Ready to connect** — step-by-step: [docs/DEPLOY_RAILWAY.md](./docs/DEPLOY_RAILWAY.md)

1. New Project → Deploy from GitHub → `Ahmed-Sleem/rectangle`
2. **Root Directory:** `apps/web`
3. Build: `npm ci --include=dev && npm run build` · Start: `npm run start`
4. Generate domain · auto-deploy on `main`

Local parity check: `cd apps/web && npm run verify:deploy`

---

## Repository layout

```text
rectangle/
├── apps/web/                # Vite + React shell (P0)
├── design/                  # Approved GUI + tokens
├── docs/                    # Architecture, naming, plans
├── research/                # Product intelligence
├── railway.toml
├── README.md
└── LICENSE
```

---

## Documentation

| Doc | Why |
|-----|-----|
| [apps/web/README.md](./apps/web/README.md) | Run / build / Railway for the app |
| [design/DESIGN_SYSTEM.md](./design/DESIGN_SYSTEM.md) | GUI tokens & shell spec |
| [design/demo/shell.html](./design/demo/shell.html) | Original HTML design demo |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Shell + feature modules + Railway |
| [docs/PRODUCT_FEATURE_BLUEPRINT.md](./docs/PRODUCT_FEATURE_BLUEPRINT.md) | Complete feature/page blueprint for the ultimate Arabic-first construction PMO app |
| [docs/plans/P0_SHELL_APP.md](./docs/plans/P0_SHELL_APP.md) | P0 execution plan |
| [docs/DEPLOY_RAILWAY.md](./docs/DEPLOY_RAILWAY.md) | **Railway connect checklist** |
| [research/INDEX.md](./research/INDEX.md) | Research pack navigation |

---

## Status

| Phase | State |
|-------|--------|
| Competitive & OSS research | Complete (snapshot 2026-07-22) |
| Design direction | **Approved** |
| Product name | **Rectangle** |
| **P0 shell app** | **Done** — registry + empty routes, tests green |
| Railway config | **Ready** — [docs/DEPLOY_RAILWAY.md](./docs/DEPLOY_RAILWAY.md) |
| Feature pages | Not started (P1+) |
| Railway connect | Your step: connect GitHub (see deploy guide) |

---

## License

MIT — see [LICENSE](./LICENSE).  
Third-party products and trademarks remain their owners’.
