# Integration Recipes — How to Assemble the Stack

## Recipe A — Greenfield “Tornix-like” MVP (recommended)

```
                    ┌──────────────┐
   Mobile (RN/Flutter) │ WatermelonDB │──sync──┐
                    └──────────────┘         │
┌─────────┐  REST/WS  ┌──────────────────────▼───┐
│ React   │──────────▶│ FastAPI  +  workers       │
│+SVAR/   │           │ LangGraph agents          │
│dhtmlx   │           │ pyCritical / MPXJ sidecar │
│+pdf.js  │           └──────────┬────────────────┘
└─────────┘                      │
        ┌────────────────────────┼──────────────────────┐
        ▼                        ▼                      ▼
   PostgreSQL+pgvector        Redis                 S3/MinIO
   OpenFGA (optional)         Meilisearch           ClamAV
        │
        ▼
   n8n → WhatsApp/Telegram/Email
   LiveKit → meetings
   Keycloak → enterprise SSO (phase 2)
```

**Ship order modules:** Auth → Projects/Tasks → Today dashboard → Gantt+CPM → Risks → Docs+PDF pins → Approvals → AI brief → P6 import → Offline mobile → WhatsApp.

---

## Recipe B — Plane fork + construction modules

1. Deploy Plane self-host  
2. Extend work item types: `rfi`, `risk`, `boq_line`  
3. Add external services: MPXJ importer, pdf.js app, LangGraph worker  
4. **License audit** before proprietary packaging  
5. Replace/extend AI with your agents grounded on new types  

**Pros:** UI velocity. **Cons:** fighting upstream; construction is a second-class citizen.

---

## Recipe C — ERPNext commercial spine + custom field app

1. ERPNext = customers, projects, costing, POs, invoices, approvals  
2. Custom React/Flutter “Site App” for drawings, daily logs, chat, AI  
3. Sync via Frappe REST/webhooks  

**Pros:** money correct. **Cons:** two UXs; GPL boundary.

---

## Recipe D — Automation brain (n8n) around thin core

Use when validating integrations before building SoR:
- Webhook from form → create task  
- WhatsApp inbound → parse → risk draft  
- Daily cron → AI status email  

Core product still needs own DB; n8n is not system of record.

---

## Recipe E — AI specialist sidecar

```
Our PMO  ◀──API──▶  ALICE / nPlan / Buildots (customer already owns)
         ◀──MCP──▶  Internal LangGraph tools wrapping those APIs
```

Don’t rebuild CV progress or generative schedule year-1.

---

## Concrete npm/pip starter sets

### Python API
```
fastapi uvicorn sqlalchemy asyncpg alembic pydantic-settings
redis arq httpx python-multipart
langgraph langchain-openai llama-index
pgvector  # via sqlalchemy
pypdf pdfplumber openpyxl pandas numpy
# P6:
mpxj  # or PyP6Xer / xer-reader
pycritical
# optional:
casbin
```

### TypeScript web
```
react vite typescript tailwind shadcn
@tanstack/react-query zustand
react-hook-form zod
i18next react-i18next
@dnd-kit/core @dnd-kit/sortable
@xyflow/react
pdfjs-dist react-pdf
# gantt pick one:
@svar-ui/react-gantt
# or dhtmlx-gantt
recharts
socket.io-client
date-fns
```

### Mobile RN
```
expo
@nozbe/watermelondb
i18next
react-native-pdf or webview pdf
```

### Sidecars (docker-compose)
```
postgres:16
redis:7
minio/minio
getmeili/meilisearch
openfga/openfga
n8nio/n8n
livekit/livekit-server
clamav/clamav
keycloak/keycloak  # phase 2
```

---

## Test assets to collect (non-code)

| Asset | Why |
|-------|-----|
| Sample XER from P6 | Import golden tests |
| Sample MPP | MSP path |
| Multilingual BOQ xlsx | Column mapping |
| Large A1 PDF plan | Viewer perf |
| Arabic RTL UI checklist | QA |
| RFI/submittal email samples | Ingestion |

---

## What NOT to waste months on

| Temptation | Instead |
|------------|---------|
| Full Bluebeam clone | pdf.js pins + enough markup |
| Full BIM clash | xeokit view only later |
| Own WhatsApp protocol | Cloud API |
| Own CPM in JS only | Server pyCritical + paint Gantt |
| Fork OpenProject + Plane both | Pick one strategy |
| Train foundation LLM | RAG + tools + good data model |

---

## Priority shopping list (first 30 days of build)

1. Repo monorepo: `apps/web`, `apps/api`, `apps/worker`, `packages/shared`  
2. Postgres schema: org, project, task, activity, dependency  
3. Better Auth + basic RBAC  
4. Task list + kanban (dnd-kit)  
5. Gantt CE + server CPM  
6. pdf.js viewer + pin prototype  
7. LangGraph “daily brief” tool-calling on mock data  
8. Meilisearch on tasks/docs  
9. Docker compose sidecars  
10. Arabic i18n skeleton + Cairo font  

---

## Cross-links
- Taxonomy: `../02-feature-taxonomy.md`  
- Architecture patterns: `../synthesis/02-backend-architecture-patterns.md`  
- Build thesis: `../synthesis/06-build-recommendations.md`  
- Full apps: `../open-source/` · `./01-forkable-apps.md`  
