# Plane — Deep Profile (OSS)

| | |
|--|--|
| **Site** | https://plane.so |
| **GitHub** | github.com/makeplane/plane |
| **License** | Open core (check current LICENSE; enterprise features cloud/airgap) |
| **Positioning** | AI-native project + knowledge management for teams **and agents** |
| **Customers logos** | Sony, Aramco, Amazon, Accenture, governments… (marketing) |

## Product structure (4-in-one workspace)

1. **Projects** — initiatives → projects → epics/cycles → work items  
2. **Wiki** — docs tied to work  
3. **Plane AI** — agents, NL queries, generation  
4. **Desk** — support desk (coming soon messaging)

## Core concepts / IA

| Concept | Role |
|---------|------|
| Workspace | Tenant |
| Project | Container |
| Work item | Polymorphic issue (custom types) |
| Cycles | Sprint-like timeboxes + burndown |
| Modules | Work grouping by area |
| Initiatives | Higher-level rollup (paid tiers) |
| Views | Saved filters; List, Board, Calendar, Gantt, Spreadsheet |
| Pages/Wiki | Knowledge |
| Intake | Requests → work items |

## Features vs OpenProject (from Plane’s own 2026 comparison — vendor-biased but useful)

| | Plane | OpenProject |
|--|-------|-------------|
| UX modernity | High | Lower |
| Gantt depth | Good | Deeper traditional |
| Cost/EVM | Weak/none | Stronger |
| AI | Production agents | Little |
| Boards | All tiers | Some ent |
| Deploy | Cloud, self-host, air-gap | Cloud EU, self-host |

## GUI / UX patterns — steal these

1. **Modern minimal shell** — adaptive features on/off  
2. **Five layouts one click** — list/board/gantt/calendar/spreadsheet  
3. **Cycles + Modules** mental model (product teams)  
4. **Command menu** (Ctrl/Cmd-K)  
5. **AI side panel** contextual to workspace  
6. **Agents as first-class assignees**  
7. **Slack/Teams presence** for AI  
8. Onboarding speed for mixed technical/non-technical  

## Backend / architecture

### Classic public stack (VERIFIED multiple eng blogs)
| Component | Tech |
|-----------|------|
| Frontend | Originally **Next.js**; releases note migration toward **React Router + Vite** for apps (2026 release notes) |
| Backend | **Django (Python)** |
| DB | **PostgreSQL** |
| Cache/queue | **Redis/Valkey** |
| Object storage | **S3-compatible** (MinIO in compose — maintenance caveats noted by analysts in 2026) |
| Messaging | **RabbitMQ** in fuller deploys |
| Extra services | Gateway proxy, Pilot integrations historically; AI service (OpenAI + LangChain era) |

### Architecture notes
- API-first  
- Docker compose / K8s horizontal scale path  
- Importers (Jira, etc.) as growth loop  
- Security patches called out in release notes (IDOR, SSRF fixes) — mature enough to be attacked = real usage  

## AI (strategic)
- Workspace-grounded answers (not generic chatbot)  
- Agents triage, assign, draft, update  
- “Built around AI” narrative matches Tornix  

## Fit for Tornix-like build

| Option | Note |
|--------|------|
| Fork Plane | Fastest path to modern PM+AI UX; **must add** construction objects, EVM, AR RTL, P6, drawings |
| Copy IA | Cycles/modules less relevant than Portfolio/WBS for construction — adapt |
| Stack parallel | Django/Next or FastAPI/React similar to many startups |
| Gap to close | Cost, EVM, RFI/submittal, BOQ, Arabic, offline drawings |

**Closest OSS to Tornix “AI twin + modern UX”**; farthest from construction field.
