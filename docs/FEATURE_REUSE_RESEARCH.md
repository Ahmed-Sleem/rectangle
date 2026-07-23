# Rectangle Feature Reuse Research

**Status:** Working research register for code we can reuse, fork, study, or integrate while building Rectangle feature-by-feature.  
**Created:** 2026-07-23  
**Rule:** Append new findings; do not delete old candidates without a dated decision note.  
**Build rule:** We still implement one feature at a time. This file prevents forgetting candidates and patterns.

---

## 0. How to use this file

For every feature/page we build:

1. Open this file and the feature blueprint.
2. Pick the relevant section.
3. Decide one of: `reuse`, `adapt`, `integrate`, `reference only`, `reject`.
4. Verify license before using any code.
5. Write a focused implementation plan for that one feature.
6. Build, test, and push only after full verification.

Reuse modes:

| Mode | Meaning |
|---|---|
| `reuse` | Copy/adapt code directly after license review |
| `adapt` | Use patterns/components but rewrite for Rectangle architecture |
| `integrate` | Run as sidecar/service or call its API |
| `reference only` | Study UX/data model only |
| `reject` | Do not use unless requirements change |

---

## 1. Cross-cutting architecture rules from this research

- Rectangle shell stays custom. Do **not** import a full PM app as the shell.
- Use open-source apps as pattern libraries and data-model references, not as unreviewed production chunks.
- Prefer MIT/Apache/BSD for reusable code.
- Treat GPL/AGPL/open-core projects as reference or isolated sidecars unless legal review approves reuse.
- Every feature must support Arabic text and eventual RTL.
- Every feature must expose context to the universal AI agent through a controlled contract, not random DOM scraping.
- Every system action must create audit events and be available to the AI context/log tools.

---

## 2. Project / task / kanban / portfolio foundations

### Candidate: Plane

- URL: https://github.com/makeplane/plane
- Found via: GitHub project-management/kanban search and open-source PM lists.
- What it gives: modern issue/task management, cycles, modules, rich markdown, kanban/list style, Docker self-hosting.
- Reuse mode: **reference/adapt**.
- Why useful for Rectangle:
  - Good modern interaction patterns for issues/tasks.
  - Useful feature boundaries: projects, issues, cycles/modules, docs/triage.
  - Good reference for self-hostable SaaS-style architecture.
- Cautions:
  - Software-team domain, not construction controls.
  - Do not copy product assumptions; adapt task/board UX only.

### Candidate: OpenProject

- URL: https://github.com/opf/openproject
- Found via: open-source PM list, GitHub topics, internal research.
- What it gives: project/portfolio management, work packages, Gantt, time, budgets, BIM references, mature permissions.
- Reuse mode: **reference only / possible sidecar study**.
- Why useful:
  - Mature PM concepts and permission model.
  - Work package/Gantt/BIM integration ideas.
  - Good reference for enterprise project data depth.
- Cautions:
  - Rails/Angular stack and license constraints; do not embed directly without legal review.

### Candidate: Focalboard / Mattermost Boards

- URL: https://github.com/mattermost-community/focalboard
- Found via: open-source PM lists.
- What it gives: Kanban/table/calendar board patterns, Trello/Notion-like views.
- Reuse mode: **reference/adapt**.
- Why useful:
  - Lightweight board/table UX reference.
  - Good for Tasks feature page ideas.
- Cautions:
  - Project appears less central than Mattermost product now; verify maintenance before reuse.

### Candidate: Taiga / WeKan / Planka / Leantime / Huly

- URLs:
  - https://github.com/kaleidos-ventures/taiga
  - https://github.com/wekan/wekan
  - https://github.com/plankanban/planka
  - https://github.com/Leantime/leantime
  - https://github.com/hcengineering/platform
- Found via: open-source PM alternative lists.
- Reuse mode: **reference only** unless a specific component is needed.
- Why useful:
  - Kanban interactions, task workflows, project views, chat/collab combination patterns.
- Cautions:
  - Domain mismatch; avoid importing large architectures.

### Rectangle decision

For Projects/Tasks, build native Rectangle feature modules. Use Plane/Focalboard/OpenProject only for interaction and data-model inspiration.

---

## 3. Construction-specific admin / field / ERP

### Candidate: OpenConstructionERP

- URL: https://github.com/datadrivenconstruction/OpenConstructionERP
- Found via: GitHub construction ERP search.
- What it claims: BOQ, PDF/CAD/BIM takeoff, cost databases, AI cost matching, daily diary, HSE, punch list, 4D scheduling, 5D cost, tendering, risk, reports, regional standards, many modules.
- Reuse mode: **deep reference / license review before any code reuse**.
- Why useful:
  - Closest public code-direction match to Rectangle’s construction depth.
  - Useful checklist for BOQ, cost catalogues, BIM/BCF, clash issues, HSE, daily diary.
  - Interesting AI triage/cost-impact ideas.
- Cautions:
  - Must verify maturity, code quality, security, and license before relying on it.
  - Claims are broad; inspect code module by module before reuse.

### Candidate: ERPNext Construction / Frappe

- URLs:
  - https://github.com/frappe/erpnext
  - https://github.com/frappe/frappe
- Found via: internal research and OSS construction tool lists.
- What it gives: ERP/accounting/projects/inventory/HR, construction add-ons in ecosystem.
- Reuse mode: **integration/reference**.
- Why useful:
  - Cost, procurement, inventory, accounting, approvals patterns.
  - Possible ERP integration target for actuals/materials.
- Cautions:
  - GPL/LGPL ecosystem questions; do not copy core code casually.
  - Heavy ERP mental model may slow Rectangle UX.

### Candidate: Redmine / Tuleap

- URLs:
  - https://github.com/redmine/redmine
  - https://github.com/Enalean/tuleap
- Found via: OSS construction/PM lists.
- What it gives: issue workflows, docs, attachments, custom fields.
- Reuse mode: **reference**.
- Why useful:
  - Generic issue/change/RFI-like workflow reference.
  - Custom field and plugin patterns.
- Cautions:
  - Older UX; not aligned with Rectangle visual bar.

### Rectangle decision

Build construction admin modules natively: RFIs, submittals, drawings, daily logs, punch, inspections, photos. Use OpenConstructionERP and ERPNext as checklists/data-model references only until inspected in depth.

---

## 4. Scheduling / Gantt / CPM / P6-MSP

### Candidate: DHTMLX Gantt Community

- URL: https://github.com/DHTMLX/gantt
- Found via: JavaScript Gantt library comparisons.
- What it gives: mature Gantt UI, MIT community edition, React wrappers/examples, upgrade path to PRO.
- Reuse mode: **evaluate for Schedule UI**.
- Why useful:
  - Mature UI and large demo ecosystem.
  - Good for first Gantt if license/features match.
- Cautions:
  - Advanced CPM/resource features may be PRO/commercial.
  - Need separate server-side CPM truth for construction-grade scheduling.

### Candidate: SVAR React Gantt

- URL: search result identifies MIT React-first Gantt.
- Found via: open-source JS Gantt comparison.
- Reuse mode: **evaluate**.
- Why useful:
  - React-native direction fits Rectangle better than imperative wrappers.
  - Potential MIT core.
- Cautions:
  - Verify actual repo/license/API and feature completeness.

### Candidate: Frappe Gantt

- URL: https://github.com/frappe/gantt
- Found via: Gantt library lists.
- What it gives: lightweight MIT timeline/Gantt.
- Reuse mode: **MVP/simple timeline only**.
- Why useful:
  - Simple dashboards/timeline previews.
- Cautions:
  - Not enough for enterprise CPM/P6 replacement.

### Candidate: MPXJ

- URL: https://github.com/joniles/mpxj
- Found via internal building-block research.
- What it gives: reads/writes many schedule formats including MSP/P6-related formats.
- Reuse mode: **integrate as parser service**.
- Why useful:
  - Strong candidate for P6/MS Project import/export pipeline.
- Cautions:
  - Java library; likely a backend sidecar/service or JVM worker.

### Candidate: PyP6Xer / XER parsers / NetworkX / pyCritical

- Found via internal research.
- Reuse mode: **evaluate for backend schedule worker**.
- Why useful:
  - P6 XER parsing, CPM algorithm, dependency graph calculations.
- Cautions:
  - Must validate correctness against real P6 exports.

### Rectangle decision

Schedule feature should split into:

1. React Gantt UI component.
2. Server-side CPM worker as source of truth.
3. Import/export worker for P6/MSP.
4. Validation report UI.

Do not trust a UI library as the scheduling engine.

---

## 5. Documents / PDF drawings / BIM / markups

### Candidate: pdf.js / PDF.js viewer ecosystem

- URL: https://github.com/mozilla/pdf.js
- Reuse mode: **reuse/integrate**.
- Why useful:
  - Browser PDF rendering foundation for specs, contracts, drawings.
  - Can support page canvas, highlights, annotations with custom layers.
- Cautions:
  - Need own document/version metadata, permissions, markup persistence.

### Candidate: react-pdf / react-pdf-highlighter style libraries

- Reuse mode: **evaluate/adapt**.
- Why useful:
  - Faster PDF page rendering and highlights in React.
- Cautions:
  - Need maintenance/license review.

### Candidate: xeokit SDK / xeokit BIM Viewer

- URLs:
  - https://github.com/xeokit/xeokit-sdk
  - https://github.com/xeokit/xeokit-bim-viewer
  - https://github.com/xeokit/xeokit-bim-viewer-app
- Found via: BIM/IFC viewer search.
- What it gives: high-performance WebGL BIM/IFC/XKT viewer, tree views, section planes, BCF viewpoints, metadata, multi-model app examples.
- Reuse mode: **integrate/evaluate for BIM V2**.
- Why useful:
  - Strongest public AEC viewer candidate.
  - Can support model issue pins, BCF, storey/object tree, model navigation.
- Cautions:
  - BIM is V2; do not block core Docs/Drawings on full BIM viewer.
  - Conversion pipeline (IFC→XKT) must be planned.

### Candidate: That Open / web-ifc ecosystem

- URL: https://github.com/ThatOpen/engine_web-ifc
- Reuse mode: **evaluate**.
- Why useful:
  - IFC parsing/viewing stack alternative.
- Cautions:
  - Compare performance, docs, and licensing vs xeokit before choosing.

### Rectangle decision

Documents V1 should start with PDF/doc registry + version control. Drawings V1 should use PDF.js-style rendering/markup. BIM viewer comes after document/drawing core is stable.

---

## 6. Workflow / approvals / automations

### Candidate: bpmn-engine / bpmn.io ecosystem

- URL: https://github.com/paed01/bpmn-engine
- Found via: workflow engine search.
- What it gives: BPMN 2.0 execution engine in JavaScript; extendable BPMN elements.
- Reuse mode: **evaluate for workflow backend or reference**.
- Why useful:
  - Formal workflow language for approval chains, conditional routes, parallel steps.
- Cautions:
  - BPMN can be too heavy for first approval MVP.

### Candidate: Windmill

- URL: https://github.com/windmill-labs/windmill
- What it gives: scripts → workflows, webhooks, UIs, permissions, scheduling, credentials; Rust/TypeScript/Svelte/Postgres.
- Reuse mode: **reference/integrate only for internal automation later**.
- Why useful:
  - Strong workflow/internal-tools model.
  - Good reference for running typed tools with permissions.
- Cautions:
  - AGPL; likely not direct embed.
  - Too broad for first approval workflow.

### Candidate: n8n / Activepieces / Node-RED / StackStorm

- Reuse mode: **integration/reference**.
- Why useful:
  - External automations, WhatsApp/email/webhooks, integration recipes.
- Cautions:
  - Not the core approval workflow. Use later as integration fabric.

### Rectangle decision

Start with native approval engine:

- request type
- approval steps
- role/user assignee
- status history
- SLA timers
- audit events

Add visual workflow builder later. Consider BPMN only if workflows become deeply complex.

---

## 7. AI agent / RAG / tool-calling / observability

### Candidate: LangGraph

- URL: https://github.com/langchain-ai/langgraph
- Found via: AI agent framework research.
- What it gives: stateful graph orchestration, checkpointing, multi-step agents, human-in-the-loop patterns.
- Reuse mode: **primary candidate for AI agent orchestration**.
- Why useful:
  - Best match for long-running, controlled, loop-aware Rectangle agents.
  - Supports explicit graph nodes/edges and state, better than one-shot chat.
  - Good fit for human approval before actions.
- Cautions:
  - Need strict tool schemas, auth scopes, audit logging, budget/loop limits.

### Candidate: OpenAI Agents SDK / Responses API patterns

- Reuse mode: **evaluate adapter**.
- Why useful:
  - Native tool calling, hosted model workflow, possible future computer/file/search tools.
- Cautions:
  - Vendor lock-in; wrap behind Rectangle model adapter.

### Candidate: LlamaIndex / Haystack / RAGFlow / Dify

- Reuse mode: **RAG/reference/integration**.
- Why useful:
  - Document-heavy retrieval, citations, ingestion pipelines, semantic search.
  - RAGFlow/Dify can inspire no-code/visual agent or RAG management.
- Cautions:
  - Need tenant isolation and internal deployment model.

### Candidate: CrewAI / AutoGen / Semantic Kernel / Agno / PydanticAI

- Reuse mode: **evaluate by feature**.
- Why useful:
  - CrewAI/AutoGen for multi-agent roles; Semantic Kernel for enterprise plugin skill pattern; PydanticAI for type-safe tools; Agno for sessions/memory/MCP.
- Cautions:
  - Do not create uncontrolled autonomous agents. Rectangle needs auditable, permissioned action loops.

### Candidate: traceAI / OpenTelemetry AI tracing

- URL from search: FutureAGI traceAI and ai-evaluation.
- Reuse mode: **observability reference/evaluate**.
- Why useful:
  - Agent traces, tool calls, eval metrics, span-based observability.
- Cautions:
  - Need data privacy review for on-prem/internal company deployments.

### Rectangle full-agent requirements — DO NOT FORGET

The Rectangle chatbot is not a simple chat widget. It must become a full system agent:

- It receives current system state: active page, selected project, route, visible records, filters, permissions, current language/direction.
- It receives user context: role, tenant, project memberships, permissions, recent actions, assigned work, open approvals.
- It can query action logs:
  - last 100 actions for the current user
  - last 10,000 actions system-wide / tenant-wide with permission filters
  - tools like `view_more_user_actions`, `view_more_system_actions`, `summarize_recent_activity`
- It has tools for safe reads:
  - get current page context
  - get project summary
  - search documents/specs/RFIs/tasks
  - get schedule status
  - get risk register
  - get approval queue
  - get audit trail for an entity
- It has tools for draft actions:
  - create draft task
  - draft RFI
  - draft submittal review note
  - draft risk/mitigation
  - draft report section
  - draft schedule narrative
- It has tools for controlled real actions only after confirmation:
  - assign task
  - change status
  - send notification
  - create approval request
  - attach/link records
- It must run agentic loops like ReAct/state graph:
  - observe context
  - reason over allowed tools
  - call tool
  - inspect result
  - continue or ask user
  - stop with cited answer / draft / action confirmation
- It must track loop count and token/tool budget.
- If more loops are needed than allowed in one interaction, it asks user to continue in the next message/session.
- It must be aware of session continuity and persistent memory boundaries.
- It must have a detailed system prompt describing Rectangle data model, permissions, tool rules, Arabic/English behavior, and safe action policies.
- Every tool call and model decision must be logged for audit/debugging.
- It must support Arabic questions and Arabic outputs with citations.

### Rectangle decision

Use a graph/state-machine agent architecture (LangGraph-like) rather than a single prompt. Build our own tool registry and audit wrapper. Start with read-only current-page/project Q&A before allowing draft actions.

---

## 8. Audit log / action log / AI-oriented system control

### Candidate: nestjs-audit-log

- URL: https://github.com/nestarc/nestjs-audit-log
- Found via: audit log search.
- What it gives: Prisma change tracking, append-only PostgreSQL storage, sensitive field masking, manual logging, query API, keyset cursors, tenant scoping patterns.
- Reuse mode: **reference/adapt**.
- Why useful:
  - Strong fit for Rectangle audit requirements.
  - Good ideas: wildcard filters, manual events, tenant context enforcement, masking.
- Cautions:
  - Backend stack may not be NestJS/Prisma; adapt concepts if using FastAPI/SQLAlchemy or another stack.

### Candidate: Audit-Log-NestJS examples / audit-logs GitHub topic

- URLs:
  - https://github.com/subhashishjs/Audit-Log-NestJS
  - https://github.com/topics/audit-logs?l=typescript
- Reuse mode: **reference**.
- Why useful:
  - Shows common Postgres/TypeScript audit implementations and UI examples.
- Cautions:
  - Many examples are small; validate production quality.

### Rectangle system log requirements — DO NOT FORGET

The platform must include a first-class action log designed for both humans and AI agents:

- Store at least last 100 actions per user quickly accessible.
- Store at least last 10,000 actions per tenant/system quickly accessible.
- Longer-term audit history should be retained according to tenant policy, not hard-limited to 10,000.
- Log every meaningful user/system/AI event:
  - login/logout/session events
  - record create/update/delete
  - status changes
  - approvals/rejections
  - document uploads/downloads/version changes
  - AI tool calls
  - AI drafts
  - AI action confirmations
  - permission/security events
  - integration/webhook events
- Event fields should include:
  - tenant_id
  - actor_user_id / actor_agent_id
  - impersonation/delegation info
  - action name
  - entity type/id
  - before/after diff when safe
  - metadata
  - result success/failure
  - source IP/device/session
  - correlation id / request id
  - timestamp
- Sensitive fields must be masked/redacted.
- Audit events must be append-only.
- AI reads from logs must be permission-filtered.
- AI action tools must write audit records before/after execution.

### AI-oriented architecture requirements

- Every backend action must be exposed through validated service functions, not raw DB writes.
- Tools are wrappers around service functions with Zod/Pydantic schemas.
- Tools enforce auth/RBAC before execution.
- Tools return structured results and citations/entity references.
- Dangerous tools require human confirmation.
- The UI and API must be designed for agent control: explicit IDs, predictable state machines, clear errors, audit trails.
- Use clean architecture boundaries:
  - domain models
  - application services/use-cases
  - infrastructure adapters
  - API/controllers
  - AI tools wrapping use-cases
  - audit/event bus
- All external input validated.
- All state transitions explicit.
- No production mocks.

### Per-company deployment model

Rectangle should support **one system per company** as a primary deployment mode:

- Single-tenant deployment option for each company/internal environment.
- Optional multi-tenant SaaS later, but architecture must not block single-tenant installs.
- Tenant/company has own database or strict schema isolation depending deployment model.
- Company admin controls users, roles, modules, data retention, integrations, AI provider keys, and network/security settings.
- Support SSO/OIDC/SAML later.
- Support local/private model or company-owned API key where required.
- No cross-company data leakage possible.

### Security baseline

- Login required.
- Email verification or admin invite verification.
- Role/project permission checks everywhere.
- Session/device management.
- CSRF/XSS protections if cookie auth.
- Rate limiting and abuse protection.
- File virus scanning.
- Audit logs for security events.
- Secrets never exposed to frontend.
- AI prompt/tool injection protections.
- Object-level authorization tests.

---

## 9. Chat / messaging / notifications

### Candidate: Mattermost

- URL: https://github.com/mattermost/mattermost
- Search result example mirror: https://github.com/mozilla/chat.mozillafoundation.org
- What it gives: self-hosted Slack alternative, channels, files, mentions, notifications, search, enterprise patterns.
- Reuse mode: **reference/integrate**.
- Why useful:
  - On-prem/company deployment fit.
  - Good reference for messaging, channel permissions, notifications.
- Cautions:
  - Do not embed full chat into Rectangle core initially.

### Candidate: Matrix / Element / Synapse

- URLs:
  - https://github.com/element-hq/synapse
  - https://github.com/element-hq/element-web
- Reuse mode: **integration/reference**.
- Why useful:
  - Open protocol, self-hosting, federation optional, bots/webhooks.
- Cautions:
  - Complex deployment and UX; might be overkill for entity comments.

### Candidate: Rocket.Chat / Zulip / Nextcloud Talk

- Reuse mode: **reference/integrate later**.
- Why useful:
  - Team chat, notifications, self-hosted options.
- Cautions:
  - Rectangle needs record-linked comments first, not a full chat clone.

### Rectangle decision

Start with:

1. Comments on every entity.
2. Mentions and notifications.
3. Project chat later.
4. WhatsApp/Microsoft/Telegram notification integrations.

Do not overbuild full chat before core project records exist.

---

## 10. Auth / tenant / permissions / internal company deployment

### Candidate: Keycloak

- URL: https://github.com/keycloak/keycloak
- Reuse mode: **integrate for enterprise SSO option**.
- Why useful:
  - OIDC/SAML, realms, enterprise identity, self-hosted.
- Cautions:
  - Heavy. MVP can start simpler but architecture should not block Keycloak.

### Candidate: Better Auth / Auth.js / Lucia successors

- Reuse mode: **evaluate for web auth layer**.
- Why useful:
  - Modern app auth patterns.
- Cautions:
  - Verify current maturity and framework fit before choosing.

### Candidate: OpenFGA / Casbin

- URLs:
  - https://github.com/openfga/openfga
  - https://github.com/casbin/casbin
- Reuse mode: **evaluate**.
- Why useful:
  - Fine-grained project/entity permissions and ReBAC/RBAC.
- Cautions:
  - Start simple if needed, but model permissions so migration is possible.

### Rectangle decision

Auth/permissions must be finished early because AI tools and audit logs depend on it. The AI agent can only be safe if permission checks are already correct.

---

## 11. Mobile / offline / Arabic/i18n

### Candidate: i18next / FormatJS / Lingui

- Reuse mode: **evaluate for i18n**.
- Why useful:
  - Arabic/English translation, namespaces, interpolation, pluralization.
- Cautions:
  - Must support RTL layout and Arabic field content, not just labels.

### Candidate: PowerSync / WatermelonDB / RxDB

- Reuse mode: **evaluate for mobile/field offline**.
- Why useful:
  - Offline field workflows: daily logs, photos, punch, inspections.
- Cautions:
  - Offline architecture must be designed around conflict resolution and audit events.

### Rectangle decision

Arabic/RTL is early web foundation. Mobile/offline is field phase but data model should plan for sync from day one.

---

## 12. Immediate next research/implementation queue

Before building each module, do a focused spike:

1. Shared UI + i18n/RTL + feature config.
2. Projects feature: inspect Plane/OpenProject/ERPNext project models.
3. Tasks feature: inspect Plane/Focalboard/OpenProject board/list/detail patterns.
4. Documents feature: inspect pdf.js/react-pdf and document metadata/version models.
5. Risks feature: inspect risk register UIs and OpenProject/Primavera patterns.
6. Approvals feature: inspect simple native workflow vs BPMN decision.
7. Schedule feature: benchmark DHTMLX/SVAR/Frappe and choose UI + server CPM worker.
8. AI agent foundation: design LangGraph-like state machine, tool registry, audit wrapper, user/system logs.
9. Audit log foundation: design append-only event table and last-100/last-10000 retrieval APIs.

---

## 13. Append-only decisions

### 2026-07-23 initial research pass

- Use open-source apps as references first; avoid importing large GPL/AGPL systems into production paths until legal/architecture review.
- Build each Rectangle feature natively and one-by-one.
- Prioritize AI/tool/audit-safe architecture before allowing the chatbot to perform actions.
- The action log and tool registry are foundational, not optional AI extras.

---

## 14. Deep validation pass — GitHub metadata snapshot

**Date:** 2026-07-23  
**Method:** GitHub repository API metadata snapshot + web search. Values can change; re-check before implementation.

| Repo | Stars | License | Main language | Updated | Archived | Initial compatibility decision |
|---|---:|---|---|---|---|---|
| `makeplane/plane` | 54,908 | AGPL-3.0 | TypeScript | 2026-07-23 | No | **Reference only** for UX/data model. AGPL means no direct code reuse in proprietary/internal product without legal approval. |
| `opf/openproject` | 15,636 | GPL-3.0 | Ruby | 2026-07-23 | No | **Reference only** for work packages, Gantt, permissions, BIM concepts. Stack/license mismatch. |
| `mattermost-community/focalboard` | 26,311 | NOASSERTION | TypeScript | 2026-07-23 | No | **Reference/adapt patterns** for board/table UX; license/maintenance must be checked before reuse. |
| `frappe/erpnext` | 37,182 | GPL-3.0 | Python | 2026-07-23 | No | **Integration/reference** for ERP/cost/procurement; avoid direct code copy. |
| `datadrivenconstruction/OpenConstructionERP` | 544 | NOASSERTION | HTML | 2026-07-23 | No | **Deep reference only until inspected.** Claims match domain but license/code quality require careful review. |
| `DHTMLX/gantt` | 1,822 | MIT | JavaScript | 2026-07-23 | No | **Evaluate for Schedule UI.** MIT core; advanced features likely commercial. |
| `frappe/gantt` | 6,054 | MIT | JavaScript | 2026-07-23 | No | **Use only for simple timeline/MVP previews.** Not construction-grade CPM. |
| `joniles/mpxj` | 336 | LGPL-2.1 | Java | 2026-07-22 | No | **Integrate as isolated parser/worker** for MSP/P6 formats; LGPL and JVM boundary need review. |
| `mozilla/pdf.js` | 53,624 | Apache-2.0 | JavaScript | 2026-07-23 | No | **Strong reuse candidate** for PDF/drawing rendering foundation. |
| `QuocVietHa08/react-pdf-highlighter-plus` | 58 | MIT | TypeScript | 2026-07-22 | No | **Evaluate** for PDF annotations/quotes/export; young project, inspect quality before dependency. |
| `xeokit/xeokit-sdk` | 918 | AGPL-3.0 | HTML | 2026-07-23 | No | **Integration/reference only unless AGPL acceptable.** Strong BIM viewer tech, license caution. |
| `xeokit/xeokit-bim-viewer` | 551 | AGPL-3.0 | JavaScript | 2026-07-11 | No | **Reference/integration later** for BIM V2; conversion pipeline required. |
| `paed01/bpmn-engine` | 961 | MIT | JavaScript | 2026-07-07 | No | **Evaluate** if native approval engine becomes too complex; MIT and focused. |
| `windmill-labs/windmill` | 17,225 | NOASSERTION | Rust | 2026-07-23 | No | **Reference/integrate later** for automation; too broad for core approvals. |
| `langchain-ai/langgraph` | 37,923 | MIT | Python | 2026-07-23 | No | **Primary AI orchestration candidate** for stateful loop-aware agents. |
| `microsoft/autogen` | 59,918 | CC-BY-4.0 | Python | 2026-07-23 | No | **Reference/evaluate.** License not ideal for direct embedding; strong multi-agent ideas. |
| `crewAIInc/crewAI` | 56,006 | MIT | Python | 2026-07-23 | No | **Evaluate for role-agent patterns**, but Rectangle likely needs stricter graph/tool control. |
| `run-llama/llama_index` | 51,032 | MIT | Python | 2026-07-23 | No | **Strong RAG candidate** for document-heavy Q&A/citations. |
| `deepset-ai/haystack` | 25,988 | Apache-2.0 | Python | 2026-07-23 | No | **RAG pipeline candidate**; compare with LlamaIndex for doc ingestion/search. |
| `infiniflow/ragflow` | 85,766 | Apache-2.0 | Go | 2026-07-23 | No | **Evaluate as RAG service/reference**; strong doc-RAG product but may be heavy. |
| `langgenius/dify` | 149,925 | NOASSERTION | TypeScript | 2026-07-23 | No | **Reference/possible sidecar only**; visual RAG/agent UX ideas, license review required. |
| `nestarc/nestjs-audit-log` | 2 | MIT | TypeScript | 2026-06-12 | No | **Reference code/pattern** for audit log API; small repo, inspect before reuse. |
| `mattermost/mattermost` | 38,534 | NOASSERTION | TypeScript | 2026-07-23 | No | **Integration/reference** for on-prem chat/notifications; too large to embed. |
| `keycloak/keycloak` | 35,804 | Apache-2.0 | Java | 2026-07-23 | No | **Enterprise SSO integration candidate**. Heavy but proven. |
| `openfga/openfga` | 5,485 | Apache-2.0 | Go | 2026-07-23 | No | **Strong fine-grained auth candidate** for project/entity/ReBAC permissions. |
| `casbin/casbin` | 20,281 | Apache-2.0 | Go | 2026-07-23 | No | **Embeddable authZ candidate** for RBAC/ABAC/ReBAC if simpler than OpenFGA. |
| `i18next/i18next` | 8,609 | MIT | JavaScript | 2026-07-20 | No | **Strong i18n candidate** for Arabic/English app labels. |
| `meilisearch/meilisearch` | 58,704 | NOASSERTION | Rust | 2026-07-23 | No | **Search candidate**, but Arabic analyzer/tokenization must be tested. |
| `TanStack/table` | 28,221 | MIT | TypeScript | 2026-07-23 | No | **Strong table foundation** for dense custom UI; headless fits Rectangle design system. |
| `TanStack/virtual` | 7,015 | MIT | TypeScript | 2026-07-23 | No | **Strong virtualization utility** for dense tables/lists. |
| `adazzle/react-data-grid` | 7,656 | NOASSERTION | TypeScript | 2026-07-22 | No | **Evaluate** if we need batteries-included editable grids; license metadata must be checked. |

### Deep validation summary

- **Best immediate reuse candidates:** `TanStack/table`, `TanStack/virtual`, `i18next`, `pdf.js`, possibly `DHTMLX/gantt` community for early Gantt UI.
- **Best backend/AI candidates to prototype:** `LangGraph`, `LlamaIndex` or `Haystack`, `OpenFGA` or `Casbin`, audit-log patterns from `nestjs-audit-log`.
- **Reference-only due to license/stack:** Plane, OpenProject, ERPNext, xeokit (unless AGPL compatible or isolated), Dify/Mattermost depending license model.
- **Needs hands-on spike:** OpenConstructionERP, DHTMLX/SVAR/Frappe Gantt comparison, MPXJ parser service, Arabic search with Meilisearch vs Postgres vs Elasticsearch.

---

## 15. Feature-by-feature reuse decisions for first build sequence

### 15.1 Shared UI primitives + dense tables

Candidates:

- `TanStack/table` + `TanStack/virtual`: **recommended first choice**.
- `react-data-grid`: evaluate only if inline editing/grid behavior becomes complex.
- AG Grid Community: powerful but heavier; avoid unless TanStack becomes too costly to assemble.

Required modifications:

- Build Rectangle table wrapper with design tokens, Arabic/RTL support, sticky headers, row height tokens, right-aligned numeric columns.
- Add server-side pagination/sorting/filtering contract early.
- Add accessibility and keyboard navigation rules.

Decision:

- Use TanStack Table for first real tables unless spike exposes a blocker.

### 15.2 i18n / RTL

Candidates:

- `i18next`: **recommended**.
- FormatJS/Lingui: evaluate only if ICU/plural needs become complex.

Required modifications:

- Translation namespace per feature.
- `title` / `titleAr` in every `FeatureModule`.
- App-level direction state and logical CSS.
- Arabic font decision before public Arabic UI.

Decision:

- Start with i18next-style architecture and logical CSS audit.

### 15.3 Projects / tasks / work packages

Candidates:

- Plane: reference for modern issue UX.
- OpenProject: reference for enterprise work package/project model.
- Focalboard: reference for board/table views.

Required modifications:

- Convert software issue concepts into construction work packages/tasks.
- Add project hierarchy, stakeholders, WBS links, and permissions.
- Add AI context adapter for current project/page.

Decision:

- Native Rectangle implementation; no direct code reuse from full PM apps.

### 15.4 Documents / drawings

Candidates:

- `mozilla/pdf.js`: **recommended rendering base**.
- `react-pdf-highlighter-plus`: evaluate for annotation UX and quote-to-highlight feature.
- `pdf-annotator-react`: evaluate for drawing/freehand tools.

Required modifications:

- Store annotations independently in Rectangle DB.
- Link markups to RFIs/issues/tasks/photos.
- Version-aware drawing/document model.
- Permission and audit wrapper for every annotation.

Decision:

- Start with pdf.js or a React wrapper; evaluate annotation library in a spike.

### 15.5 Schedule / Gantt / P6

Candidates:

- DHTMLX Gantt Community: evaluate for production Gantt UI.
- SVAR React Gantt: evaluate for React-native fit.
- Frappe Gantt: use only for simple timeline previews.
- MPXJ: evaluate as import/export worker.

Required modifications:

- Server-side CPM engine as source of truth.
- Activity table + Gantt share same data store.
- P6 import validation report.
- Baselines and calendars.

Decision:

- Run Gantt spike before committing. Do not build CPM inside UI component.

### 15.6 AI agent foundation

Candidates:

- LangGraph: primary orchestration candidate.
- LlamaIndex/Haystack/RAGFlow: RAG candidates.
- PydanticAI/Semantic Kernel/CrewAI: evaluate for typed tools / plugin patterns.
- OpenTelemetry/traceAI-style tracing: observability reference.

Required modifications:

- Tool registry wraps Rectangle use-cases only.
- Every tool has schema validation, permission check, audit log, and structured return.
- Agent loop state includes loop count, budget, current page/project, user action log, system action log.
- Human confirmation for writes.
- Arabic-ready prompts and outputs.

Decision:

- Build Rectangle agent architecture explicitly. LangGraph-like state machine is the best current pattern.

### 15.7 Audit/action log foundation

Candidates:

- `nestjs-audit-log`: reference for append-only, tenant-aware audit API.
- Audit log topic examples: reference only.

Required modifications:

- Backend-stack-specific implementation.
- Last-100 user actions and last-10,000 tenant actions optimized queries.
- Sensitive field redaction.
- AI-readable but permission-filtered log access.

Decision:

- Treat audit/action log as core platform feature before AI write-actions.

### 15.8 Auth / permissions

Candidates:

- Keycloak for enterprise SSO integration.
- OpenFGA for ReBAC/Zanzibar-style permission graph.
- Casbin for embeddable RBAC/ABAC/ReBAC policies.

Required modifications:

- Tenant/company isolation.
- Project/entity-level access control.
- AI tool authorization check before every tool call.

Decision:

- Start with simple RBAC model shaped to migrate to OpenFGA/Casbin. Choose final authZ after backend stack decision.

---

## 16. Open gaps requiring focused spikes

1. **License review:** Plane AGPL, OpenProject GPL, ERPNext GPL, xeokit AGPL, Dify/Mattermost license metadata.
2. **Gantt bake-off:** DHTMLX Community vs SVAR vs Frappe for Schedule UI.
3. **P6 import proof:** MPXJ or Python parser with real sample XER/XML files.
4. **Arabic search proof:** Meilisearch vs Postgres full-text vs Elasticsearch/OpenSearch Arabic analyzer.
5. **PDF annotation proof:** pdf.js + react-pdf-highlighter-plus vs custom annotation layer.
6. **AI orchestration proof:** LangGraph state machine with tool budget, log reads, citations, and human approval.
7. **Audit log proof:** append-only event table and last-100/last-10000 query performance.
8. **Per-company deployment blueprint:** database isolation, secrets, backups, SSO, AI provider settings.

---
