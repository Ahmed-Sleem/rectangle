# Backend & Architecture Patterns Synthesis

## 1. Reference architectures observed

### Pattern M1 — Modular monolith PM (OpenProject)
```
Angular SPA ──HAL+JSON──► Rails API + Engines
                              │
                     PostgreSQL + Redis + Jobs
```
- **When:** Complex permissions, mature PM domain  
- **Pros:** Transactional integrity, module packs  
- **Cons:** Scaling teams on Rails/Angular talent; slower AI iteration unless separate service  

### Pattern M2 — Modern dual stack (Plane)
```
React/Next (or Vite) ──REST──► Django API
                      │           │
                   WebSocket    Postgres + Redis + RabbitMQ + S3
                      │
                   AI service (LLM + tools)
```
- **When:** Fast product iteration, AI features  
- **Pros:** Python AI ecosystem adjacent  
- **Cons:** Multi-service ops (MinIO/RabbitMQ footguns)  

### Pattern M3 — Metadata ERP (Frappe/ERPNext)
```
Desk JS ──► Frappe (Python) DocTypes/Workflows ──► DB
```
- **When:** Forms, approvals, accounting-linked  
- **Pros:** Build DocTypes fast  
- **Cons:** Field UX & realtime collab harder  

### Pattern M4 — Construction mega-SaaS (Procore/ACC) INFERRED
```
Mobile / Web
   │
API gateway ──► domain services (drawings, financials, RFIs…)
   │                    │
Event bus          Object storage (drawings/video)
   │                    │
Search/AI layer    Data warehouse / analytics
   │
Integration marketplace
```
- Document pipelines and permissions dominate cost  
- AI layer reads unified project graph  

### Pattern M5 — AI specialist CV (Buildots/OpenSpace)
```
Device capture → ingest → CV/BIM align → insights API → PM tools
```
- GPU/heavy batch; not your core MVP  

---

## 2. Domain data model (canonical for Tornix-like)

```
Organization
  └── Workspace/Portfolio
        └── Project
              ├── Members/Roles
              ├── WBS / Phases / Milestones
              ├── Activities (schedule) ── dependencies, calendar, resources
              ├── WorkItems/Tasks
              ├── Documents / DrawingSets / Revisions / Markups
              ├── Forms: RFI, Submittal, DailyLog, Punch, ChangeOrder
              ├── RiskRegister
              ├── Cost: BudgetLines, Commitments, Actuals, EVM snapshots
              ├── Approvals (instances of WorkflowDefinition)
              ├── Conversations / Messages
              ├── Meetings / Transcripts
              └── AI: AgentRuns, Recommendations, Memories
```

**Key design choices:**
1. **Polymorphic WorkItem vs separate tables** for RFI/Submittal — construction systems often separate for reporting; Plane-style polymorphic for flexibility. Hybrid: `WorkItem` base + type-specific extensions.  
2. **Drawing pin** coordinates: `{drawing_rev_id, page, x, y, world?}`.  
3. **EVM snapshots** periodic materialization for performance.  
4. **Schedule engine** may be separate service (CPU-bound CPM).  
5. **Append-only audit** for financial/doc.

---

## 3. Critical subsystems

| Subsystem | Notes |
|-----------|-------|
| AuthN/Z | OIDC + fine-grained project ACLs; agent service accounts with scopes |
| Files | Multipart upload, virus scan, image pyramids for drawings, PDF tile render |
| Search | OpenSearch/Meilisearch + embeddings store |
| Jobs | Report gen, email, CPM recalc, AI runs |
| Realtime | WebSocket for chat/notifications |
| CPM engine | Isolated lib; version baselines immutable |
| AI orchestration | Tool-calling agents with allowlist; human-in-the-loop gates |
| Integrations | P6 XER, webhooks, ERP connectors |
| Multitenancy | Schema or row-level `org_id` everywhere |
| i18n | ICU messages; store user content raw; UI RTL flip |

---

## 4. Suggested target stack for a greenfield Tornix-like

> Opinionated recommendation for product decisions’s ecosystem  — revisit at build kickoff.

| Layer | Choice | Why |
|-------|--------|-----|
| API | **FastAPI** or Django/DRF | Speed + AI ecosystem; Django if admin/ERP-heavy |
| Web | **React + Vite** (or Next if SEO marketing site separate) | Plane direction; app is authenticated SPA |
| Mobile | **Flutter** or React Native | Tornix already ships dual mobile; Flutter strong AR RTL |
| DB | **PostgreSQL** | Universal |
| Cache/queue | **Redis** + **ARQ/Celery/BullMQ** | |
| Object store | **S3** | |
| Search | **Meilisearch** → OpenSearch later | |
| Realtime | **Socket.io / WS** via API gateway | |
| AI | Tool-calling LLM + pgvector; later dedicated workers | |
| Obs | OpenTelemetry + structured logs | |
| Deploy | Docker compose → K8s; Caddy/Traefik | Match typical small-team ops skills |

**Do not fork GPL OpenProject** into proprietary without legal plan. **Apache/MIT** components preferred for core; study OP ideas.

---

## 5. Performance hotspots (plan early)
- CPM on 50k activities  
- Drawing tile rendering  
- Portfolio dashboards fan-out  
- AI context assembly (token budgets → retrieve only linked entities)  
- Mobile sync conflicts  

---

## 6. Security musts for construction
- Customer-managed encryption keys (enterprise later)  
- Granular doc permissions (bid secrecy)  
- Agent cannot approve payments without dual control  
- GCC data residency options  
- Audit export for disputes/claims  
