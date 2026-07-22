# Building Blocks Pack — Libraries, GitHub, OSS to Build On

**Collected:** 2026-07-22 (session 2)  
**Purpose:** Practical inventory of **code and systems you can fork, embed, integrate, or copy patterns from** to build a Tornix-like AI construction/PMO product faster.  
**Complements:** `../open-source/` (full PM apps) · `../synthesis/06-build-recommendations.md`

---

## How to use

| Goal | Open |
|------|------|
| Start here / decision map | This file |
| Full apps to fork or extend | [01-forkable-apps.md](./01-forkable-apps.md) |
| Gantt, CPM, P6/MSP | [02-scheduling-gantt-cpm-p6.md](./02-scheduling-gantt-cpm-p6.md) |
| PDF drawings, markup, BIM | [03-documents-pdf-bim-drawings.md](./03-documents-pdf-bim-drawings.md) |
| Auth, RBAC, tenancy, workflows | [04-workflow-auth-tenancy.md](./04-workflow-auth-tenancy.md) |
| AI agents, RAG, voice, meetings | [05-ai-agents-rag-voice.md](./05-ai-agents-rag-voice.md) |
| Chat, realtime, notifications | [06-collab-chat-realtime-notify.md](./06-collab-chat-realtime-notify.md) |
| Mobile offline, i18n RTL | [07-mobile-offline-i18n.md](./07-mobile-offline-i18n.md) |
| Search, files, analytics, collab docs | [08-data-search-files-analytics.md](./08-data-search-files-analytics.md) |
| Excel/BOQ, EVM, Monte Carlo | [09-commercial-cost-risk-parsers.md](./09-commercial-cost-risk-parsers.md) |
| Recommended stacks & recipes | [10-integration-recipes.md](./10-integration-recipes.md) |
| Machine registry | [data/resources.json](./data/resources.json) |

---

## Use-mode legend

| Mode | Meaning |
|------|---------|
| **FORK** | Clone/adapt as product base (watch license) |
| **EMBED** | npm/pip library inside our UI/API |
| **INTEGRATE** | Run as sidecar service; call API |
| **REFERENCE** | Steal IA/UX/algorithms; rewrite |
| **PAID-OSS** | Open core / community free, PRO features paid |
| **COMMERCIAL** | Not free for production without license — listed for bake-off only |

---

## Golden path (recommended default stack)

Aligned with prior synthesis (FastAPI/React/Postgres + AI agents):

| Layer | Pick | Mode | Why |
|-------|------|------|-----|
| Auth | **Better Auth** or Keycloak (enterprise SSO) | EMBED / INTEGRATE | 2026 OSS default; Keycloak for SAML |
| AuthZ | **OpenFGA** or Casbin | INTEGRATE / EMBED | ReBAC for project-scoped perms |
| API | FastAPI | greenfield | AI + Python ecosystem |
| Web | React + Vite + shadcn/ui | greenfield | |
| Gantt UI | **dhtmlx-gantt** MIT CE or **SVAR Gantt** MIT | EMBED/PAID-OSS | CPM in PRO or own engine |
| CPM engine | **pyCritical** + custom / NetworkX | EMBED | Server-side truth |
| P6/MSP | **MPXJ** (+ PyP6Xer) | EMBED | Industry standard interchange |
| PDF drawings | **pdfjs-dist** + AnnotationEditor / react-pdf-highlighter-* | EMBED | |
| BIM (later) | **xeokit** or That Open **web-ifc** | EMBED | |
| Workflow UI | **xyflow (React Flow)** | EMBED | Approval DAG builder |
| Workflow exec | In-app state machine first; **Temporal** later | EMBED→INTEGRATE | |
| Automations | **n8n** (self-host) | INTEGRATE | WhatsApp/email bridges |
| AI agents | **LangGraph** | EMBED | HITL + state |
| RAG | **LlamaIndex** or LangChain + **pgvector** | EMBED | |
| Search | **Meilisearch** | INTEGRATE | Arabic tokenization test required |
| Chat realtime | Socket.io / LiveKit (meetings) | EMBED/INTEGRATE | |
| Collab docs | TipTap + **Hocuspocus/Yjs** | EMBED | |
| E-sign | **Documenso** | INTEGRATE | |
| Mobile offline | **WatermelonDB** or PowerSync | EMBED/PAID | Field |
| Notifications | Firebase/APNs + **Telegram Bot API** + WhatsApp Cloud API | INTEGRATE | |
| Charts | Recharts / Apache ECharts | EMBED | |
| Files | S3 + **ClamAV** | INTEGRATE | |
| i18n | i18next + `rtl-detect` / logical CSS | EMBED | |

---

## License red flags (always re-verify before ship)

| Risk | Examples |
|------|----------|
| **GPL → viral if linked into proprietary SaaS** | OpenProject, ERPNext, some older Gantt licenses |
| **AGPL** | Some self-host tools (check Windmill, ProcessMaker editions) |
| **Fair-code / SSPL / BUSL** | n8n (Sustainable Use), some DBs |
| **Open core trap** | dhtmlx/SVAR/Bryntum: CE free, critical path often PRO |
| **Deprecated** | Lucia Auth (→ Better Auth); Auth.js maintenance mode narratives 2026 |

**Rule:** Prefer **MIT / Apache-2.0** for core product code paths. Isolate GPL tools as **separate processes** if used.

---

## Map to Tornix taxonomy (T0–T12)

| Taxonomy | Primary building blocks |
|----------|-------------------------|
| T0 Platform | Better Auth, Keycloak, OpenFGA, Postgres, S3, Meilisearch |
| T1 Work | dnd-kit kanban, FullCalendar, SVAR/dhtmlx Gantt |
| T2 Construction field | pdf.js markup, later xeokit |
| T3 Schedule | MPXJ, PyP6Xer, pyCritical, Gantt PRO or own CPM |
| T4 Cost | openpyxl/SheetJS, own EVM math |
| T5 Risk | pyCritical PERT, numpy Monte Carlo |
| T6 Docs | MinIO/S3, TipTap, pdf.js |
| T7 Approvals | xyflow + Temporal/in-app |
| T8 PMO | ECharts dashboards |
| T9 Collab | LiveKit, Socket.io, Matrix bridges optional |
| T10 AI | LangGraph, LlamaIndex, WhisperLiveKit, LiveKit agents |
| T11 Analytics | Metabase/Cube (later), ECharts |
| T12 Integrations | n8n, MPXJ, official WhatsApp/Telegram SDKs |

---

## File count target
This pack is the **implementation shopping list**. Product/competitor research stays in parent `market-research/`.
