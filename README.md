# Rectangle

**Rectangle** is an AI-native construction / PMO product: bilingual (Arabic + English), field-aware, controls-aware — built to be clearer and faster than bolting chatbots onto yesterday’s tools.

I kept running into the same mess on real projects: schedules in one tool, costs in another, risks in a spreadsheet, drawings in WhatsApp, and executives asking for a status that was already wrong by the time it was pasted into a slide.

This repository is the **single home** for Rectangle: product research now, application code next.

> *Every side of the project. One frame.*

---

## Repository layout

```text
rectangle/
├── README.md
├── LICENSE
├── design/                  # Approved GUI direction + design system
│   ├── README.md
│   ├── DESIGN_SYSTEM.md
│   ├── demo/shell.html      # Interactive shell demo
│   └── tokens/
├── docs/
│   ├── NAMING.md
│   └── ARCHITECTURE.md      # Shell + features + Railway
└── research/                # Product intelligence
    ├── INDEX.md
    ├── baseline-tornix/
    ├── landscape/
    ├── competitors/
    ├── open-source/
    ├── building-blocks/
    ├── synthesis/
    ├── pricing/
    ├── data/
    └── sources/
```

App source (when added) lives alongside `design/` and `research/` (e.g. `apps/web`) — **same repo**.

---

## Start with the research

| Doc | Why |
|-----|-----|
| [research/INDEX.md](./research/INDEX.md) | Full navigation |
| [research/landscape/01-landscape-map.md](./research/landscape/01-landscape-map.md) | How the market is layered |
| [research/synthesis/06-build-recommendations.md](./research/synthesis/06-build-recommendations.md) | Concrete build thesis |
| [research/building-blocks/00-INDEX.md](./research/building-blocks/00-INDEX.md) | What you can fork, embed, or integrate |
| [research/pricing/market-pricing-bands.md](./research/pricing/market-pricing-bands.md) | Min/max pricing of similar tools |
| [docs/NAMING.md](./docs/NAMING.md) | Brand notes |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Shell + feature modules + Railway |
| [docs/plans/P0_SHELL_APP.md](./docs/plans/P0_SHELL_APP.md) | **Executable P0 plan** (shell app checklist) |
| [design/DESIGN_SYSTEM.md](./design/DESIGN_SYSTEM.md) | GUI tokens & shell spec |
| [design/demo/shell.html](./design/demo/shell.html) | Open-in-browser design demo |

---

## Status

| Phase | State |
|-------|--------|
| Competitive & OSS research | Complete (snapshot 2026-07-22) |
| Building-block inventory | Complete |
| Pricing landscape | Complete (third-party ranges) |
| Product name | **Rectangle** (locked) |
| Design direction | **Approved** (dark chrome + white rectangle shell) |
| Monorepo | **This repo** — research + design; app scaffold pending |
| Architecture direction | **Shell + feature modules** (modular monolith); Railway auto-deploy |
| P0 shell plan | **Ready for confirmation** — [docs/plans/P0_SHELL_APP.md](./docs/plans/P0_SHELL_APP.md) |
| Application code | Not started (awaiting `CONFIRM P0`) |

---

## What this is *not*

- Not a clone of any single vendor  
- Not internal process notes or private credentials  

---

## License

Documentation in this repository is released under [MIT](./LICENSE) unless a subdirectory states otherwise.  
Third-party products, trademarks, and linked projects remain the property of their owners. Research summaries are independent and may include vendor marketing claims marked as such.

---

## Contributing

Prefer small, factual PRs with sources when extending research. See [research/sources/bibliography.md](./research/sources/bibliography.md).
