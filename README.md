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
├── docs/
│   └── NAMING.md            # Brand lock
└── research/                # Product intelligence (current)
    ├── INDEX.md
    ├── baseline-tornix/     # Reference product deep-dive
    ├── landscape/           # Market map + feature taxonomy
    ├── competitors/         # Commercial products
    ├── open-source/         # OSS platforms
    ├── building-blocks/     # Libraries & integration recipes
    ├── synthesis/           # UX, backend, gaps, build plan
    ├── pricing/             # Market pricing bands
    ├── data/                # JSON matrices
    └── sources/             # Bibliography
```

App source (when added) will live alongside `research/` (for example `apps/`, `packages/`) — **same repo**, not a second project.

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

---

## Status

| Phase | State |
|-------|--------|
| Competitive & OSS research | Complete (snapshot 2026-07-22) |
| Building-block inventory | Complete |
| Pricing landscape | Complete (third-party ranges) |
| Product name | **Rectangle** (locked) |
| Monorepo | **This repo** — research in tree; app scaffold pending |
| Application code | Not started |

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
