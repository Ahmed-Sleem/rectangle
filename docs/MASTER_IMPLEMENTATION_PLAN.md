# Rectangle Master Implementation Plan

**Status:** Execution plan for building the full Rectangle app.  
**Branch:** develop on `dev`; merge to `main` only when a verified milestone is ready for online testing.  
**Created:** 2026-07-23  
**Inputs:** `PRODUCT_FEATURE_BLUEPRINT.md`, `FEATURE_REUSE_RESEARCH.md`, `GUI_SIZING_RULES.md`, `MOTION_GUIDELINES.md`, `ARCHITECTURE.md`, `DEPLOY_RAILWAY.md`, `_working_docs/AGENT_RULES.md`.

---

## 0. Mission and execution rule

Build Rectangle as an **Arabic-first, AI-native construction / PMO operating system** with:

- shell-owned menu + main canvas + universal AI panel,
- one feature at a time,
- centralized automated tests,
- no fake production behavior,
- top-tier validation/security,
- app architecture prepared for one-company internal deployments and future SaaS.

**Golden implementation loop for every item:**

```text
1. Pick one scoped gap/feature
2. Re-read relevant docs/research
3. Write implementation plan for that item
4. Add/adjust tests first or alongside code
5. Implement real production behavior
6. Run centralized verification
7. Run focused smoke/manual checks
8. Update docs/audit/logs
9. Commit to dev with details
10. Only merge/push main when owner wants online testing
```

---

## 1. Definition of production-ready

A Rectangle feature is production-ready only when all of these are true:

- Real implementation exists; no mocks/placeholders/fake data in production path.
- All inputs validated at UI and service/backend boundaries.
- Object-level authorization is enforced.
- Meaningful actions produce audit/action-log events.
- Tests cover success, failure, permissions, validation, and edge cases.
- Arabic text and future RTL behavior are considered.
- Feature follows `GUI_SIZING_RULES.md` and `MOTION_GUIDELINES.md`.
- Feature exposes a safe AI context/tool contract if relevant.
- Central verification passes.
- Docs are updated.

---


## 1.1 Mandatory UI/UX presentation contract

Before implementing any feature, read [`docs/UI_UX_PRESENTATION_PLAN.md`](./UI_UX_PRESENTATION_PLAN.md) and write/confirm that feature's presentation contract. This is now part of the production-ready definition.

For each feature, the implementation plan must specify:

- what is displayed to the user,
- which cards, tables, charts, lists, badges, avatars, progress bars, activity feeds, and AI panels appear,
- which backend fields power each visible element,
- what actions are available to each role,
- what filters/search/sort/view toggles exist,
- which modal/drawer/page flows create/edit/detail records,
- what loading/empty/error/permission states look like,
- what settings are needed for the feature,
- what Arabic/RTL checks are required,
- what is hidden until real backend support exists.

Tornix is a coverage reference only. Rectangle must include all equivalent visible surfaces, but with better grouping, stronger production workflows, auditability, permissions, integrations, and AI grounding.

## 2. Confidence / success-rate scale

These percentages are **planning confidence**, not guarantees.

| Confidence | Meaning |
|---:|---|
| 95–100% | Can implement with current knowledge and stack; low unknowns |
| 85–94% | Clear path; manageable integration/testing unknowns |
| 70–84% | Needs focused spike/proof before full implementation |
| 50–69% | High unknowns; do not build full feature before prototype |
| <50% | Research/requirements insufficient |

---

## 3. Global quality gates

### 3.1 Central command

Current web verification command:

```bash
cd apps/web
npm run verify:deploy
```

Current checks included:

- TypeScript typecheck
- oxlint
- Vitest tests
- production build

### 3.2 Required expansion of central tests

Add these as the system grows:

```text
npm run test:unit          # pure logic / utilities
npm run test:integration   # components + services + DB when backend exists
npm run test:contract      # API and feature contracts
npm run test:e2e           # critical user journeys
npm run test:a11y          # keyboard, ARIA, contrast smoke
npm run test:security      # dependency audit, static checks, validation tests
npm run test:i18n          # Arabic labels, RTL, long text
npm run test:smoke         # production-like local serve/API smoke
npm run verify:all         # runs all relevant checks
```

### 3.3 Push gate

Before any GitHub push:

- `git status` clean except intended files.
- `npm run verify:deploy` or future `npm run verify:all` passes.
- Focused tests for touched feature pass.
- Production local smoke passes for route/deploy changes.
- Commit message includes what/why/tests.
- Final report includes branch, commit, verification, deploy trigger status.

---

## 4. Security baseline for every phase

Target OWASP ASVS-style expectations:

- trusted service-layer validation,
- single vetted auth mechanism,
- centralized authorization enforcement,
- secrets never in frontend,
- safe error handling,
- audit/security logs,
- object-level access control,
- encryption in transit and at rest where applicable,
- prompt-injection and unsafe tool-call defenses for AI.

### 4.1 Validation matrix

| Input type | Required validation |
|---|---|
| Text | trim, min/max length, allowed chars where relevant, HTML/script safety |
| IDs | UUID/ULID format, tenant/project ownership, permission check |
| Numbers | min/max, precision, currency/unit validation |
| Dates | valid timezone, range, baseline/data-date constraints |
| Files | size, type, extension, MIME, virus scan, tenant quota |
| URLs | allowed protocols, SSRF-safe backend handling |
| Enums | explicit allowed values |
| State transitions | current state → requested state rules |
| AI tool args | schema validation + permission + risk policy |

---

## 5. Architecture foundation phase — P0.5

**Goal:** turn shell app into a feature-ready product foundation.

**Confidence:** 95%

### 5.1 Shared UI primitives

Build:

- Button
- IconButton
- Input
- Textarea
- Select
- Checkbox/Switch
- Badge
- Card
- Toolbar
- DataTable shell wrapper
- EmptyState
- LoadingState
- ErrorState
- PageHeader
- PageGrid
- Drawer/Panel
- Modal/Confirm
- Toast/Notification

Reuse candidates:

- Native React/CSS first.
- TanStack Table later for data grids.

Tests:

- unit/component tests for variants, disabled state, keyboard activation.
- a11y tests for labels, focus visible, aria attributes.

Validation/security:

- no raw HTML rendering unless sanitized.
- all interactive controls have accessible names.

Done when:

- components use centralized theme tokens only.
- no hardcoded colors outside tokens.
- Story/demo page or test fixtures exist.

### 5.2 i18n + RTL foundation

Build:

- i18next-style translation architecture.
- English/Arabic namespaces.
- app language state.
- direction state (`ltr`/`rtl`).
- feature title fallback `title` / `titleAr`.
- Arabic font plan.

Confidence: 90%

Tests:

- language switch test.
- Arabic labels render.
- document direction changes.
- long Arabic text does not break shell.

Validation/security:

- translation keys must be static; no untrusted translation injection.

Done when:

- shell/menu/page titles support Arabic.
- `dir` can flip app safely.

### 5.3 Feature configuration manifest

Build:

- central feature config type.
- enabled/disabled/order/navGroup/title override.
- tenant/instance config placeholder from static JSON first.
- registry filters from config.

Confidence: 90%

Tests:

- disabled feature hidden from nav/routes.
- order override works.
- title override works.
- Arabic title override works.

Security:

- backend must enforce feature permissions later; frontend hiding is not auth.

Done when:

- menu can be customized without editing shell code.

---

## 6. Backend foundation phase — P0.6

**Goal:** create secure backend before real data-heavy features.

**Confidence:** 80% until backend stack is chosen.

### 6.1 Backend stack decision

Recommended default:

- API: FastAPI or Node/Nest depending final preference.
- DB: PostgreSQL.
- Cache/jobs: Redis later.
- Search: postpone engine choice, start interface.
- File storage: S3-compatible adapter.

Decision gate:

- Choose backend language/framework before implementing Projects with persistence.

Tests:

- health endpoint.
- config validation.
- DB migration test.
- API contract test.

### 6.2 Auth foundation

Build:

- login/session.
- invite verification.
- password or SSO-ready abstraction.
- session/device table.
- logout.

Candidates:

- Keycloak for enterprise SSO later.
- Better Auth/Auth.js style if Node stack.
- FastAPI Users or custom if Python stack.

Confidence: 75% until stack decision.

Security:

- rate limit login.
- password policy if password auth.
- secure cookies if cookie auth.
- CSRF protections.
- audit auth events.

### 6.3 Tenant/company isolation

Build:

- company/tenant entity.
- tenant context resolver.
- tenant_id on all tenant-scoped tables.
- optional DB-per-company path later.

Confidence: 85%

Tests:

- user from tenant A cannot read tenant B.
- missing tenant context fails closed.
- background jobs preserve tenant context.

### 6.4 Authorization foundation

Build:

- RBAC: owner/admin/manager/member/external.
- project membership.
- permission checks in services.
- future OpenFGA/Casbin adapter interface.

Confidence: 80%

Tests:

- can/cannot per role.
- object-level auth tests.
- AI tool auth tests later.

### 6.5 Audit/action log foundation

Build before AI write actions.

Tables/services:

- audit_events
- user_action_log view/query
- tenant_action_log view/query

Fast queries:

- last 100 actions for current user.
- last 10,000 actions for tenant/system.

Fields:

- tenant_id
- actor_user_id / actor_agent_id
- action
- entity_type/entity_id
- before/after safe diff
- result
- metadata
- request_id/correlation_id
- ip/session/device
- timestamp

Confidence: 85%

Tests:

- event append-only.
- keyset pagination.
- redaction works.
- tenant filtering works.
- performance with seeded 10k+ events.

---

## 7. AI agent foundation phase — P0.7

**Goal:** make universal AI safe and real before connecting it to actions.

**Confidence:** 75% until prototype.

### 7.1 Agent architecture

Preferred pattern:

- LangGraph-like state machine.
- Tool registry.
- Tool schemas with Zod/Pydantic.
- Human approval gates.
- Audit wrapper around every tool.
- Loop budget and continuation request.

Agent loop:

```text
1. Load user/session/page/project context
2. Load allowed tools
3. Observe request
4. Decide tool or answer
5. Validate tool args
6. Permission check
7. Execute read/draft/action tool
8. Audit tool call
9. Inspect result
10. Continue or stop
11. Cite records / ask confirmation / ask to continue next session
```

### 7.2 Read-only tools first

Implement:

- get_current_page_context
- get_current_user_recent_actions(limit<=100)
- get_tenant_recent_actions(limit<=10000, permission filtered)
- search_records
- get_project_summary
- get_entity_audit_trail

Tests:

- tool schema validation.
- permission denied.
- loop limit exceeded.
- Arabic prompt returns Arabic if requested.
- citations are required for factual claims.

### 7.3 Draft tools second

Implement drafts only:

- draft_task
- draft_rfi
- draft_risk
- draft_report_section

No direct writes until approval UX exists.

### 7.4 Action tools later

Only after audit + approval:

- assign_task
- update_status
- send_notification
- create_approval_request

Security:

- allowlist tools.
- prompt-injection scan for retrieved docs.
- sensitive action confirmation.
- no hidden cross-tenant access.

---

## 8. Projects feature — first real domain feature

**Confidence:** 90% after backend/auth foundation.

UI/UX display contract:
- Show real project cards/table rows with status, health, progress, dates, manager/team, and budget/location only when backed by project fields.
- Provide create, detail, edit/settings, members/stakeholders, search/filter/sort, and activity/audit views.
- Hide actions the user cannot perform; show clean empty/loading/error/permission states.
- Use the project workspace as the hub for tasks, documents, risks, approvals, schedule, controls, and field records.

Pages:

- `/projects` list
- `/projects/:id` overview
- `/projects/:id/settings`
- project create/edit
- project members/stakeholders

Data:

- Project
- Program/Portfolio later
- Stakeholder
- ProjectMember
- ProjectStatus

Validations:

- name 2–120 chars
- code unique per tenant, safe chars
- dates valid and ordered
- status enum
- budget optional positive decimal
- tenant ownership

Tests:

- create/list/detail/edit.
- validation failures.
- unauthorized access.
- Arabic project name.
- audit events.
- AI current page context returns project summary.

Success metric:

- user can create a project and see it in list/detail.
- no fake project data.

---

## 9. Today / Command Center

**Confidence:** 85%

UI/UX display contract:
- Show role-specific focus, KPI cards, due items, active project summary, risk/issue breakdown, approvals needing action, and recent activity from real records.
- Every card must drill into the source records the user can access.
- AI daily brief appears only when grounded by real activity/audit/project data with citations.

Pages:

- `/` Today
- role-specific panels
- due soon
- recent activity
- AI brief placeholder real only after agent reads logs

Dependencies:

- Projects
- Audit/action log
- Tasks later

Tests:

- empty state with no projects.
- project summary cards from real data.
- recent action feed.
- Arabic labels.

Security:

- only show records current user can access.

---

## 10. Tasks / Work Packages

**Confidence:** 85%

UI/UX display contract:
- Show list, board, and calendar views with real task cards, project, assignee, status, priority, due date, checklist progress, comments, and attachments.
- Provide create/edit/detail, assignment, status movement, filters, and comments only through backend-enforced rules.
- Keep board/list/calendar consistent and permission-aware.

Pages:

- `/tasks`
- list view
- board view
- task detail drawer/page
- work package tree later

Reuse:

- TanStack Table for list.
- board custom CSS or lightweight DnD after spike.

Validations:

- title length
- status enum
- assignee must be project member
- due date within reasonable range
- project ownership

Tests:

- CRUD.
- status transitions.
- assignment permission.
- board/list consistency.
- audit events.

AI:

- summarize my tasks.
- draft task.
- explain overdue work.

---

## 11. Documents foundation

**Confidence:** 80%; PDF annotation needs spike.

UI/UX display contract:
- Show document registry, recent files, folders/categories, metadata, versions, approval status, preview/detail, and upload flow from real document records.
- Provide upload, metadata edit, search/filter, preview/download, submit for approval, and version history actions by permission.
- AI categorization/indexing banners appear only after real extraction/indexing exists.

Pages:

- `/documents`
- registry table
- upload
- document detail
- version history
- preview

Reuse:

- pdf.js rendering.
- evaluate react-pdf-highlighter-plus for annotations.

Validations:

- file size/type.
- virus scan status.
- metadata required fields.
- version uniqueness.
- permission checks.

Tests:

- upload metadata validation.
- version workflow.
- preview loads.
- permission denied.
- audit events.

Security:

- signed URLs or backend proxy.
- no arbitrary file execution.
- scan before approved state.

---

## 12. Risks / Issues

**Confidence:** 90%

UI/UX display contract:
- Show risk KPI cards, register table, 5x5 matrix, issue log, owners, mitigation, due dates, and status from real risk/issue records.
- Provide create/edit/detail, owner assignment, mitigation task links, filters, and status updates with derived backend scoring.
- AI recommendation banners require evidence and human confirmation.

Pages:

- `/risks`
- risk register
- 5x5 matrix
- risk detail
- issue log

Validations:

- probability 1–5
- impact 1–5
- score derived, not user-supplied
- owner is project member
- mitigation due dates valid

Tests:

- create risk.
- score calculation.
- matrix grouping.
- mitigation tasks link.
- audit events.

AI:

- suggest risk wording.
- draft mitigation.
- no automatic risk score without human confirmation.

---

## 13. Approvals / workflow MVP

**Confidence:** 80%

UI/UX display contract:
- Show approval inbox, action-needed cards, request detail, SLA/due indicators, comments, participants, timeline, and decision history.
- Provide submit, approve, reject, comment, delegate/escalate where policy allows, and filters by type/status/project.
- Enforce assigned-approver and state-machine rules in the backend.

Pages:

- `/approvals`
- my inbox
- approval detail
- request submit
- approval templates admin later

Data:

- ApprovalRequest
- ApprovalStep
- ApprovalDecision
- SLA timers

Validations:

- approver must have role/permission.
- only assigned approver can approve.
- state machine enforced.
- comments length.

Tests:

- submit request.
- approve/reject.
- unauthorized approval fails.
- SLA due calculation.
- audit events.

Security:

- approvals for money/change/documents require stronger permission.

---

## 14. Schedule phase

**Confidence:** 70% until spikes complete.

UI/UX display contract:
- Show calendar, activity table, Gantt, activity detail, baseline compare, import wizard, and validation report only after schedule engine decisions are validated.
- Provide day/week/month calendar interactions, schedule filters, dependency editing, baseline view, and P6/MSP import validation.
- Calendar events aggregate real tasks, milestones, inspections, approvals, meetings, and schedule activities.

Spikes first:

1. Gantt UI bake-off: DHTMLX vs SVAR vs Frappe.
2. P6 import proof: PyP6Xer/MPXJ with sample XER/XML.
3. CPM worker proof: custom vs pyCritical.

Pages:

- `/schedule`
- Gantt
- activity table
- activity detail
- baseline compare
- import wizard
- validation report

Tests:

- dependency validation.
- CPM calculation on known sample.
- import count matches expected.
- critical path stable.
- malformed import rejected.

Security:

- file validation for imports.
- no arbitrary parsing execution.

---

## 15. Controls / EVM / cost

**Confidence:** 75%

UI/UX display contract:
- Show CPI/SPI, cost variance, actual cost, BAC/EAC/VAC, budget vs actual, cash flow, cost code tree, budget lines, actuals, forecast, and change orders from real financial records.
- Provide cost code management, budget revisions, actual import/review, change order workflows, approvals, filters, and exports.
- Financial charts are formula-backed and audited, not static visuals.

Pages:

- `/controls`
- cost code tree
- budget table
- EVM dashboard
- forecast sheet
- change orders

Validations:

- cost code unique.
- budget positive.
- currency consistent.
- EVM formulas derived.
- change order state machine.

Tests:

- CPI/SPI calculations.
- budget revisions.
- change order approval flow.
- permission checks.

Security:

- financial actions audited and approval-gated.

---

## 16. Field modules

**Confidence:** 75% after Documents/Projects/Approvals.

UI/UX display contract:
- Show a Field landing page for RFIs, submittals, daily logs, punch, drawings, photos, inspections, safety, overdue/action badges, and project/site filters.
- Provide create/detail/workflow actions, evidence upload, drawing/document/task links, and closeout actions by permission.
- Prioritize mobile-friendly dense forms and offline-ready design later.

Features:

- RFIs
- Submittals
- Daily logs
- Punch/Snagging
- Drawings
- Photos
- Inspections/Safety
- Meetings

Build order:

1. RFIs
2. Submittals
3. Daily logs
4. Drawings + pins
5. Punch
6. Photos
7. Inspections/safety
8. Meetings/minutes

Tests:

- workflow state machines.
- due dates/SLA.
- document/drawing links.
- permission and audit.
- Arabic text.

---

## 17. Search / Arabic search

**Confidence:** 65% until benchmark.

UI/UX display contract:
- Show global search/command palette with permission-filtered results grouped by project, document, task, risk, approval, meeting, correspondence, and action.
- Provide Arabic-aware query behavior, exact code search, filters, recent searches, and keyboard navigation.
- Never reveal restricted records in result counts, previews, or AI retrieval.

Spike:

- Corpus of Arabic/mixed construction text.
- Compare Postgres, Meilisearch, OpenSearch.
- Test exact code search and normalized Arabic.

Implementation:

- global search API.
- index jobs.
- permissions-filtered results.
- AI retrieval adapter.

Tests:

- Arabic normalization cases.
- code exact match.
- tenant filtering.
- permission filtering.

---

## 18. Reports / PMO analytics

**Confidence:** 80% after Projects/Tasks/Risks/Controls.

UI/UX display contract:
- Show portfolio health, strategy/KPI tree, Balanced Scorecard-style executive views, report builder, briefing packs, and export center from real rollups.
- Provide filters, saved reports, export actions, scheduled reports later, and source-record drilldown.
- Strategic cards require company configuration and source links; no static executive numbers.

Pages:

- portfolio health
- report builder
- executive briefings
- exports

Tests:

- filter persistence.
- export generation.
- report permissions.
- Arabic PDF/Excel export later.

---

## 19. Per-company deployment phase

**Confidence:** 75% until target infra chosen.

UI/UX display contract:
- Admin/settings screens must expose deployment-relevant configuration clearly: company profile, localization, users/roles, email, security, modules, workflow, integrations, AI provider, audit retention, backup/export.
- Only owners/admins see shared company configuration; personal settings remain separate.
- Configuration tests must use real endpoints/secrets and show safe error states.

Profiles:

1. local dev
2. single-company Docker Compose
3. single-company Kubernetes
4. future SaaS

Must include:

- DB backups/restores.
- secrets adapter.
- env validation.
- SSO config.
- AI provider config.
- file storage config.
- audit retention.
- upgrade process.

Tests:

- fresh install.
- backup/restore drill.
- migration up/down.
- health checks.
- config validation failure.

---

## 20. Feature implementation template

For every feature, create a plan with:

```text
Feature ID:
Route(s):
Owner/user story:
Dependencies:
Reuse candidates reviewed:
License decision:
Data model:
API/service use-cases:
UI presentation contract:
Displayed cards/tables/charts/lists:
User actions/options by role:
Loading/empty/error/permission states:
Filters/search/sort/view toggles:
Create/edit/detail modal-drawer-page flow:
Feature settings needed:
UI states:
Validation rules:
Permissions:
Audit events:
AI context/tools:
Arabic/RTL requirements:
User-facing UX notes:
No duplicate shell/page title inside content:
No developer/test/debug copy in production UI:
Tests:
Security risks:
Done criteria:
Rollback plan:
```

---

## 21. Master milestone gates

| Milestone | Scope | Confidence | Gate to pass |
|---|---|---:|---|
| M0 | Shell + theme + docs | 98% | Already mostly complete |
| M1 | Shared UI + i18n + feature config | 95% | all shell/component tests pass |
| M2 | Backend auth/tenant/audit | 80% | security tests + API contracts |
| M3 | Projects + Today | 90% | real CRUD + audit + permissions |
| M4 | Tasks + Documents + Risks | 85% | real core PMO workflows |
| M5 | Approvals + Search | 80% | workflow + Arabic search proof |
| M6 | Schedule/P6/CPM | 70% | spike success + sample imports |
| M7 | Controls/EVM | 75% | financial validation/approvals |
| M8 | Field modules | 75% | drawings/RFI/submittal/daily/punch |
| M9 | AI agent read/draft/action | 70% | tool registry + audit + approval |
| M10 | Per-company deployment | 75% | install/backup/restore/upgrade |

---

## 22. Current readiness statement

We are ready to move to implementation **after choosing the first implementation item**.

Recommended first item:

```text
M1.1 Shared UI primitives + centralized verification runner expansion
```

Why:

- every future page needs these components,
- it creates the test foundation required by rules 30–34,
- it avoids premature backend/domain complexity,
- it can be completed and verified independently.

Second item:

```text
M1.2 i18n/RTL foundation
```

Third item:

```text
M1.3 Feature configuration manifest
```

Only then start real Projects feature.
