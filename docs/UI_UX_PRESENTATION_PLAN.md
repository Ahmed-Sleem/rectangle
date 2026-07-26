# Rectangle UI/UX Presentation Plan

**Purpose:** define what Rectangle should display to end users, how each surface should behave, and which actions users should have. This document uses the attached Tornix UI inventory as an inspiration layer only. Rectangle remains its own product: production-grade, Arabic-first, AI-native, backend-backed, permission-aware, and deeper than a GUI demo.

## 0. Non-negotiable UI/product rules

1. **No fake visible data.** Counts, tables, charts, cards, avatars, progress bars, badges, notifications, AI recommendations, and activity feeds must come from real backend data or show a clean empty/loading/error/permission state.
2. **No user-visible implementation language.** Do not show words like mock, fake data, pending backend, UI shell, not implemented, or validation contract.
3. **Arabic-first, bilingual-ready.** Every user-facing label must have Arabic and English planned. RTL must be checked for every page, modal, drawer, table, chart, and avatar group.
4. **Dense but calm construction UI.** Pages should fit serious PMO/construction data without visual noise: compact cards, clear status colors, hidden scrollbars, responsive layouts, accessible controls.
5. **Backend and UI move together.** Any visible action must be backed by a real service/use-case, validation, authorization, tenant ownership checks, and audit events where meaningful.
6. **Permissions shape the UI.** Users only see actions they can perform. Restricted sections show clean permission states only when useful.
7. **AI must be grounded.** AI recommendations, summaries, and banners require real evidence/citations and must never invent project facts.

---

## 1. Competitive coverage guardrail

Rectangle must cover everything visible in the Tornix inventory, then exceed it with production depth.

| Tornix-visible area | Rectangle destination | Rectangle must be better by adding |
|---|---|---|
| Sidebar navigation | Shell feature menu | permission-aware modules, tenant-custom order/labels, grouped enterprise IA, Arabic/English labels |
| Header search/notifications/avatar | Shell global search, notifications, profile | real permission-filtered search, command palette, notification center, profile/session/device settings |
| Dashboard | Today / Command Center + Executive Home | role-specific panels, real activity feed, AI brief with citations, portfolio rollups |
| Projects | Projects / Project Workspace / Portfolio | real project settings, members, activity, stakeholders, budgets, locations, templates |
| Tasks Kanban | Tasks / Work Packages | list/board/calendar views, assignee rules, project membership checks, comments, attachments, audit |
| Email | Correspondence / Email-in / Notifications | project-linked email capture, formal correspondence, SMTP settings, retention, audit |
| Chat | Project Chat / Comments Everywhere | entity-linked comments, channels, mentions, permissions, future WhatsApp/Teams integration |
| Calendar | Calendar / Schedule / Meetings | tasks, milestones, inspections, approvals, schedule activities, external calendar sync later |
| Meetings | Meetings / Minutes | agenda, attendance, decisions, action items, linked tasks, AI minutes with review |
| Risks | Risks / Issues | full risk register, issue log, matrix, mitigation tasks, residual risk, AI only with evidence |
| Documents | Documents / Drawings / Knowledge | metadata, versions, permissions, approval status, markups, transmittals, previews |
| Requests | Approvals / Workflow | state machine, SLA, delegation, templates, approval authority, audit trail |
| Team | Team / Users / Project Members | roles, user types, workload, project assignment, external collaborators, access governance |
| Purchases | Procurement / Contracts | RFQs, bid comparison, awards, commitments, delivery tracking, ERP-ready structure |
| Costs | Controls / Budget / EVM | budget revisions, actuals, CPI/SPI, forecasts, change orders, approvals |
| Library | Knowledge / Lessons Learned | controlled articles, templates, project lessons, AI retrieval with citations |
| Strategy | Strategy / KPI Tree | BSC/OKR, KPI ownership, project contribution, executive reporting |
| PMO | Portfolio / PMO Analytics | portfolios/programs/projects hierarchy, health, reports, export, governance |

---

## 2. Shell and global surfaces

### 2.1 Navigation

Display:
- left or right-aware shell navigation depending on language direction,
- compact icon + label items,
- grouped modules for large areas such as Controls, Field, Reports, Admin,
- active page highlight,
- profile/logout area,
- optional collapsed mode with icon-only state.

User options:
- open a module/page,
- collapse/expand the menu,
- switch language from Settings/Profile,
- later: reorder/rename enabled modules if the user is an admin.

Production requirements:
- menu comes from feature registry + user permissions,
- no module appears if it has no real route/workflow,
- disabled/hidden modules are controlled by company settings, not hardcoded UI assumptions.

### 2.2 Header / command bar

Display:
- current page title/breadcrumb,
- optional back button when route history/entity hierarchy supports it,
- global search / command palette entry,
- notifications indicator,
- current user/avatar/profile menu.

User options:
- search records/actions,
- open notifications,
- navigate back within a project/entity flow,
- open profile/session/preferences.

Production requirements:
- search results are tenant- and permission-filtered,
- notifications are real records with read/unread state,
- avatars use real user profile initials/photos.

### 2.3 Universal AI assistant

Display:
- collapsible assistant panel/FAB,
- current page context indicator,
- conversation thread,
- citations/actions when real AI adapter exists.

User options:
- ask about current page/project,
- request summaries,
- draft records later,
- confirm/reject AI draft actions.

Production requirements:
- no fake AI answer,
- no hidden data access,
- all AI tool calls audited,
- all answers cite records/documents when data-backed.

---

## 3. Core page presentation requirements

### 3.1 Today / Command Center

Display:
- Today focus panel based on the logged-in user role,
- KPI cards: projects, due this week, task completion, risks/issues, approvals needing action,
- active projects summary table/cards,
- risk/issue severity breakdown,
- pending tasks and approvals,
- recent activity feed,
- AI daily brief only when grounded by real activity/data.

User options:
- open project/task/risk/approval from cards,
- filter by project/portfolio/date,
- mark personal tasks complete when authorized,
- open full report/brief,
- refresh or change dashboard view.

Better-than-Tornix requirements:
- role-specific dashboard variants for owner/executive, PM, controls manager, site engineer,
- every KPI drillable to its source records,
- empty state explains next real action without internal wording,
- AI brief includes citations and can be disabled by admin.

### 3.2 Projects / Programs / Portfolio

Display:
- searchable/filterable project list with cards and/or table view,
- project status, health, progress, dates, location, manager, team avatars, budget/contract summary where available,
- clean empty state for first company project,
- project detail workspace with overview, activity, members, documents, tasks, risks, approvals, schedule, controls,
- project settings: metadata, status, dates, ownership, code, location, permissions.

User options:
- create project,
- edit project settings,
- open project detail,
- search/filter/sort,
- assign members/stakeholders,
- view activity/audit,
- archive/close according to permissions.

Better-than-Tornix requirements:
- no sample project cards,
- object-level authorization,
- project members and stakeholders managed from GUI,
- project activity visible to users,
- Arabic project names and codes supported,
- future portfolio/program rollups.

### 3.3 Tasks / Work Packages

Display:
- list, board, and calendar views,
- task cards with title, project, assignee, status, priority, due date, checklist progress, comments/attachments indicators,
- Kanban columns based on real workflow statuses,
- My Tasks filter,
- work package/WBS context when available.

User options:
- create/edit task,
- assign to project member,
- move status if allowed,
- comment/mention,
- attach documents/photos,
- filter/sort by project, due date, priority, status, assignee.

Better-than-Tornix requirements:
- status transitions validated by backend,
- assignees must be valid project members,
- comments/attachments are real records,
- audit tracks meaningful changes,
- board/list/calendar stay consistent.

### 3.4 Schedule / Calendar

Display:
- calendar day/week/month for meetings, tasks, inspections, approvals, milestones,
- schedule activity table and Gantt view when schedule module is active,
- month/week navigation,
- upcoming events panel,
- baseline/critical path indicators after schedule engine lands.

User options:
- create/edit events or milestones,
- open linked task/meeting/inspection/activity,
- switch view,
- import schedule later,
- filter by project/team/type.

Better-than-Tornix requirements:
- calendar is not decorative; it aggregates real project records,
- schedule supports CPM, dependencies, baselines, P6/MSP import after validated spikes,
- date/time/timezone handling is explicit.

### 3.5 Documents / Drawings / Knowledge Library

Display:
- folder/category cards only when backed by real document metadata,
- document registry table/list with type, revision, status, project, uploader, date, permissions,
- recent files,
- upload flow,
- preview/detail page,
- version history,
- drawing/PDF viewer and markups after viewer implementation,
- knowledge articles/lessons/templates in a Library area.

User options:
- upload file,
- edit metadata,
- search/filter,
- preview/download if allowed,
- submit for approval,
- open version history,
- add knowledge item if permitted.

Better-than-Tornix requirements:
- file validation and security scanning strategy,
- version control,
- document permissions,
- transmittals and approval status,
- AI categorization only after real extraction/indexing exists.

### 3.6 Risks / Issues

Display:
- risk KPI cards,
- risk register table,
- 5x5 matrix with probability/impact counts,
- issue list,
- mitigation/owner/due dates,
- AI recommendation banner only when generated from real risk evidence.

User options:
- create/edit risk or issue,
- assign owner,
- link mitigation task,
- update probability/impact/status,
- filter by project/severity/owner/status,
- open detail/audit.

Better-than-Tornix requirements:
- score derived by backend,
- residual risk tracked,
- issue workflow separate from risk workflow,
- AI suggestions require human confirmation.

### 3.7 Approvals / Requests / Workflow

Display:
- action-needed cards/inbox,
- request cards with title, status, requester, due/SLA, comments, participants,
- approval detail with timeline and decision history,
- request templates later.

User options:
- submit request,
- approve/reject/comment when assigned,
- delegate/escalate where policy allows,
- search/filter by status/type/project,
- open linked records.

Better-than-Tornix requirements:
- backend state machine,
- assigned approver enforcement,
- SLA timers/reminders,
- audit trail,
- financial/change/document approvals gated by stronger permissions.

### 3.8 Team / Users / Workload

Display:
- company users and user types,
- project team cards,
- member table with role, projects, workload, status, actions,
- project member/stakeholder management,
- workload/capacity visualizations after tasks/time data exists.

User options:
- create/update user where permitted,
- manage user types/permissions,
- activate/disable user,
- assign to projects,
- view team details,
- filter by project/role/status.

Better-than-Tornix requirements:
- real RBAC/user type management,
- project-level permissions,
- no hardcoded names/avatars,
- invitations/password reset when email flow is implemented,
- workload derived from real assignments/hours.

### 3.9 Email / Correspondence / Notifications

Display:
- notification center for assignments, mentions, approvals, due dates,
- email delivery settings for admins,
- later: project-linked correspondence inbox with sender, subject, project, status, received date,
- unread/action badges.

User options:
- configure SMTP as admin,
- send test email,
- open notification/correspondence,
- mark read/archive,
- link email to project/RFI/correspondence later,
- compose formal correspondence only when backend workflow exists.

Better-than-Tornix requirements:
- email is not a fake standalone inbox,
- company-wide SMTP is encrypted and shared by owners/admins,
- correspondence becomes auditable project record,
- notifications can route to email/WhatsApp later.

### 3.10 Chat / Comments / Collaboration

Display:
- entity comments wherever records need discussion,
- project channels or chat rooms later,
- participants/online indicators only after real presence service exists,
- mentions and unread counts.

User options:
- comment on records,
- mention users,
- send project/channel messages later,
- attach files/photos,
- filter discussions by project/entity.

Better-than-Tornix requirements:
- comments are linked to records and permissions,
- chat is auditable where needed,
- formal decisions are promoted to meeting minutes/actions, not lost in chat.

### 3.11 Meetings / Minutes

Display:
- meeting list with status, privacy, participants, linked project,
- calendar integration view,
- meeting detail: agenda, attendees, decisions, action items, files,
- meeting log/history.

User options:
- create meeting,
- join/open meeting link when integration exists,
- record minutes,
- assign action items,
- export/share minutes,
- filter current/ongoing/recent.

Better-than-Tornix requirements:
- action items become real tasks,
- minutes are auditable records,
- AI meeting minutes require transcript/source and human review.

### 3.12 Procurement / Purchases / Contracts

Display:
- procurement KPI cards: contracts, active commitments, RFQs, vendors, pending actions,
- RFQ list,
- bid comparison,
- contract/commitment list,
- delivery/material tracking later.

User options:
- create RFQ,
- invite vendors later,
- compare bids,
- award/approve according to workflow,
- open contract detail,
- filter by status/vendor/project.

Better-than-Tornix requirements:
- procurement connects to budget, approvals, documents, and vendors,
- financial actions are permissioned and audited,
- no static conic chart; charts derive from real contract status.

### 3.13 Controls / Costs / EVM

Display:
- cost KPI cards: CPI, SPI, cost variance, actual cost, BAC/EAC/VAC,
- budget vs actual charts,
- cash flow chart,
- cost code tree,
- budget lines,
- actuals/imports,
- forecast/change orders.

User options:
- manage cost codes,
- enter/review budget revisions,
- import actuals,
- create change order,
- approve financial changes,
- export reports.

Better-than-Tornix requirements:
- formulas derived and tested,
- currency/project controls explicit,
- approval workflow for financial changes,
- audit and report traceability.

### 3.14 Strategy / PMO / Reports

Display:
- portfolio/program/project hierarchy,
- portfolio health cards,
- strategy overview: vision, mission, values if configured,
- KPI tree/Balanced Scorecard,
- executive report builder,
- export center.

User options:
- create portfolio/program,
- link projects to strategic goals,
- configure KPIs,
- filter dashboards,
- export PDF/Excel/PowerPoint later,
- schedule reports later.

Better-than-Tornix requirements:
- strategic KPIs connect to real project outcomes,
- PMO rollups trace to source records,
- board-ready packs have citations/source links,
- no static strategy cards without company configuration.

### 3.15 Field modules

Display:
- Field landing page grouping RFIs, submittals, daily logs, punch, inspections, safety, photos, drawings,
- action-needed and overdue badges,
- project/site filters,
- mobile-friendly layouts.

User options:
- create RFI/submittal/daily log/punch/inspection,
- add photos/evidence,
- link to drawings/documents/tasks,
- route for review/approval,
- close out with evidence.

Better-than-Tornix requirements:
- construction-admin depth beyond Tornix visible pages,
- workflow/SLA/audit for each formal record,
- drawing pins/location context,
- field/mobile readiness.

---

## 4. Settings presentation requirements

Display settings as organized expandable sections. Each section appears only for users with permission.

Required settings groups over time:
- Language and display density,
- Company profile and localization,
- Users, roles, user types, project permissions,
- Email delivery and notification channels,
- Security: password policy, sessions/devices, passkeys, SSO later,
- Feature/module configuration,
- Project defaults/templates,
- Workflow/approval rules,
- Integrations: email, calendar, storage, ERP, WhatsApp, AI provider,
- Audit retention/export,
- Backup/export/admin tools for company deployments.

User options:
- change personal language/display preferences,
- admin/company owners configure shared settings,
- test integrations using real endpoints only,
- see current shared state when multiple owners exist.

---

## 5. Page-level UI contract for implementation

Every feature implementation plan must answer these before coding:

1. What does the user see when there is no data?
2. What does the user see while loading?
3. What does the user see on backend/API error?
4. What does the user see without permission?
5. Which actions are visible for owner/admin/manager/viewer/external collaborator?
6. What cards/tables/charts are displayed, and what backend fields power them?
7. What filters/search/sort/grouping options exist?
8. What create/edit/detail flows exist: modal, drawer, or page?
9. What audit/activity is visible to users?
10. What settings are required for this feature?
11. What Arabic/RTL edge cases must be checked?
12. What AI context/actions are allowed, if any?
13. What must be hidden until it is fully implemented?

---

## 6. Implementation ordering impact

The Tornix-inspired UI inventory confirms the existing Rectangle order, with one refinement: **each feature must start with its presentation contract before backend/API/UI coding.**

Recommended sequence remains:

1. Finish Projects completely.
2. Finish auth lifecycle: invitations and password reset via real SMTP.
3. Today / Command Center using real Projects/Admin/Auth data.
4. Project members/stakeholders and activity visibility if not already completed inside Projects.
5. Tasks / Work Packages.
6. Risks / Issues.
7. Documents.
8. Approvals / Requests.
9. Calendar / Meetings / Collaboration.
10. Schedule / CPM / P6.
11. Controls / Costs / Procurement.
12. Field modules.
13. Strategy / PMO / Reports.
14. Advanced AI and integrations.

The UI can show only the parts that are truly backed by production data and actions at that point.

---

## 7. Connecting the AI insight banner

`InsightBanner` (`shared/ui/insight-banner.tsx`) is built and placed on Today
and Risks. It renders four states: `unavailable`, `pending`, `empty`, and
`ready`. Only `ready` makes a claim, and its type requires `sources`, so a
recommendation with nothing behind it cannot be rendered — that is a compile
error, not a review comment.

Today every placement is hardcoded to `unavailable`, which reports honestly
that no model is connected and describes what will happen when one is.

### What connecting a model requires

1. **An insight service** (`application/insight-service.ts`), read-only,
   permission-scoped exactly like `OverviewService`: each surface's advice is
   drawn only from records the caller can already reach. A recommendation that
   cites a project someone cannot open is a data leak wearing a helpful face.

2. **A model adapter port**, so the provider is swappable and testable without
   a network call. The service depends on the port, never on a vendor SDK.

3. **Evidence assembly before generation, not after.** The service selects the
   records first — overdue tasks, unowned critical risks, projects past their
   planned finish — and passes them to the model as the only material it may
   reason over. Asking a model for findings and then hunting for evidence to
   attach produces citations that do not support the claim.

4. **Rejection of ungrounded output.** Any recommendation referencing an id
   that was not in the supplied evidence is discarded rather than shown. The
   model is treated as a summariser of records, not a source of facts.

5. **Caching with invalidation on write**, since regenerating advice on every
   page view is both slow and expensive. Audit events already record every
   mutation and are the natural trigger.

6. **A per-tenant switch** in Settings beside the email configuration, because
   a company must be able to decline this entirely.

7. **Cost and rate limits per tenant**, enforced in the service.

### Surfaces, in order
- **Today** — a daily brief across the portfolio.
- **Risks** — which entries deserve attention and why.
- **Tasks** — overdue work and where it is blocked.
- **Projects** — a workspace summary on the project page.

Nothing else until those four are proven useful.
