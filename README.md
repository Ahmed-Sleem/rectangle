# Rectangle — Research Pack

**Rectangle** is the working name for an AI-native construction / PMO product: bilingual (Arabic + English), field-aware, controls-aware — built to be clearer and faster than bolting chatbots onto yesterday’s tools.

I kept running into the same mess on real projects: schedules in one tool, costs in another, risks in a spreadsheet, drawings in WhatsApp, and executives asking for a status that was already wrong by the time it was pasted into a slide.

This repo is the **research foundation** before application code: competitors, open source, libraries, pricing bands, and build recommendations.

> *Every side of the project. One frame.*

---

## What’s inside

```text
research/
├── baseline-tornix/     # Deep read of Tornix (reference product)
├── landscape/           # Market map + feature taxonomy
├── competitors/         # Commercial products (Procore, ACC, P6, AI specialists…)
├── open-source/         # OpenProject, Plane, ERPNext, and peers
├── building-blocks/     # Libraries, GitHub projects, integration recipes
├── synthesis/           # UX, backend, IA, AI matrix, gaps, build recommendations
├── pricing/             # Public pricing bands for similar products
├── data/                # Machine-readable JSON matrices
└── sources/             # Bibliography
```

Start here:

| Doc | Why |
|-----|-----|
| [research/INDEX.md](./research/INDEX.md) | Full navigation |
| [research/landscape/01-landscape-map.md](./research/landscape/01-landscape-map.md) | How the market is layered |
| [research/synthesis/06-build-recommendations.md](./research/synthesis/06-build-recommendations.md) | Concrete build thesis |
| [research/building-blocks/00-INDEX.md](./research/building-blocks/00-INDEX.md) | What you can fork, embed, or integrate |
| [research/pricing/market-pricing-bands.md](./research/pricing/market-pricing-bands.md) | Min/max pricing of similar tools |

---

## What this is *not*

- Not a clone of any single vendor  
- Not internal process notes or private credentials  
- Not production application code (product repo comes next, under the chosen brand name)

---

## Status

| Phase | State |
|-------|--------|
| Competitive & OSS research | Complete (snapshot dated 2026-07-22) |
| Building-block inventory | Complete |
| Pricing landscape | Complete (third-party ranges; vendors often hide list prices) |
| Product name | **Rectangle** (locked) |
| Application repository | Not created yet |

---

## License

Documentation in this repository is released under [MIT](./LICENSE) unless a subdirectory states otherwise.  
Third-party products, trademarks, and linked projects remain the property of their owners. Research summaries are independent and may include vendor marketing claims marked as such.

---

## Contributing

This pack is structured so others can extend competitor profiles, refresh pricing, or add libraries. Prefer small, factual PRs with sources. See [research/sources/bibliography.md](./research/sources/bibliography.md).
