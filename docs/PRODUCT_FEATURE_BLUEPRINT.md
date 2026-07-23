# Rectangle Product Feature Blueprint

**Status:** Canonical product blueprint for Rectangle feature/page build-out.  
**Created:** 2026-07-23  
**Audience:** Product owner, design, engineering, AI agents.  
**File rule:** Append new decisions under dated change notes; do not casually rewrite historical decisions.  
**App language rule:** The app must fully support Arabic text and RTL UI. This planning file is English for implementation clarity.

---

## 0. One-line product thesis

Rectangle is an **AI-native, Arabic-first, construction / PMO operating system**: project controls, field collaboration, documents, cost, risk, approvals, and executive portfolio intelligence in one modular shell.

---

## 1. Current architecture decision — non-negotiable

The app shell is permanent chrome. Features are standalone modules loaded into the main canvas.

```text
[left feature menu] [main white Rectangle canvas = active page] [universal AI assistant]
```

- **Left menu:** generated from enabled `FeatureModule` entries. Different instances can expose different modules.
- **Main canvas:** the only area that changes when a route/page opens.
- **Right AI panel:** universal assistant, not a feature/page. It stays shell-owned.
- **Feature folders:** must not import other feature internals; cross-feature utilities go to `shared/`.
- **Future customization:** instance/tenant configuration should be able to enable, hide, order, rename, or permission-gate modules without changing shell code.

---

## 2. Research basis consolidated

Internal research used:

- `research/landscape/02-feature-taxonomy.md` — T0–T12 master taxonomy.
- `research/synthesis/03-ia-module-organization.md` — package sequence P0–P6.
- `research/synthesis/05-gaps-and-opportunities.md` — market openings.
- `research/synthesis/06-build-recommendations.md` — build thesis and sequence.
- `research/baseline-tornix/02-modules-and-features.md` — Tornix reference module set.
- `research/building-blocks/00-INDEX.md` and `10-integration-recipes.md` — stack/building block ideas.
- `design/GUI_SIZING_RULES.md` — dense desktop GUI sizing standard.

External current scan used:

- Procore-type platforms prove the need for project management, daily logs, drawings, RFIs, submittals, documents, tasks, punch lists, safety, resources, financials, preconstruction, and AI agents/copilot. Source: https://work-management.org/worksite/construction/procore-review/
- Autodesk Construction Cloud-type platforms prove the need for Build/Docs/Takeoff/BIM collaboration: RFIs, submittals, daily logs, safety checklists, issue tracking, 2D/3D takeoff, document versioning, file permissions, audit trails, clash/model coordination. Source: https://interscale.com.au/blog/autodesk-construction-cloud-software-list/
- Oracle Primavera/P6/Primavera Cloud-type platforms prove the need for CPM scheduling, baselines, resource histograms, risk registers, Monte Carlo, budget/cashflow, portfolio planning, what-if scenarios. Sources: https://www.projectmanager.com/blog/oracle-primavera-cloud and https://www.projectmanager.com/blog/what-is-primavera-p6
- AI construction sources prove the need for cited Q&A, RFI/submittal assistance, schedule/risk agents, report generation, and human-reviewed AI actions. Sources: https://www.procore.com/ai and https://www.ingenious.build/blog-posts/ai-rfi-software

---

## 3. Product principles

1. **Arabic-first, English-ready.** Arabic is not translation afterthought. RTL layout, Arabic search, Arabic date/number display, Arabic labels, and Arabic AI must be first-class.
2. **AI-native but evidence-based.** Every AI answer must cite records/documents. No fake AI responses. Agent actions require scopes and human approval.
3. **Controls-aware.** Rectangle must understand WBS, CBS, BOQ, CPM, EVM, baselines, risk, approvals, cost impact, and change control.
4. **Field-aware.** Mobile/offline, photos, drawings, daily logs, punch, safety, inspections, and voice notes are not optional long-term.
5. **Executive-ready.** Portfolio rollups, program health, KPI trees, briefing packs, and board-ready reports must be native.
6. **Instance-customizable.** Tenants/projects can enable modules, rename labels, change workflows, add custom fields, and configure permissions.
7. **Dense desktop by default.** Construction PMO screens contain lots of data. Follow `design/GUI_SIZING_RULES.md`.
8. **Progressive depth.** Start with clean shell + real core workflows; deepen construction and AI over phases.
9. **Integration-first.** P6/MS Project, ERP/accounting, email, WhatsApp/Teams, storage, e-sign, BIM/reality capture must be planned from day one.
10. **Audit everything.** Approvals, financials, docs, AI actions, user changes, and workflow decisions must leave an audit trail.

---

## 4. Arabic / RTL requirements for the app

### 4.1 Product language behavior

| Area | Requirement |
|---|---|
| UI languages | Arabic + English from first production release |
| Direction | Full RTL shell flip for Arabic; nav on right in RTL if product owner chooses native RTL mode |
| Text entry | Arabic input everywhere: tasks, RFIs, risks, comments, chat, documents metadata |
| Mixed text | Support Arabic + English codes in same fields: `RFI-001`, `BOQ`, `WBS`, `EVM`, Arabic descriptions |
| Dates | Gregorian default; Hijri optional later for MENA public sector |
| Numbers | Tenant/user setting: Latin digits vs Arabic-Indic digits |
| Search | Arabic normalization, stemming/tokenization strategy, typo tolerance |
| AI | Arabic Q&A, Arabic summaries, bilingual citations, translate/summarize commands |
| Exports | Arabic PDF/Excel reports with RTL table layout and correct fonts |
| Notifications | Arabic push/email/WhatsApp templates |

### 4.2 Implementation requirements

- Use stable internal English IDs (`rfi`, `boq_line`, `risk_register`) and localized display labels.
- Every feature module must define `title` and `titleAr` before production enablement.
- All CSS must use logical properties where feasible: `inline-start`, `inline-end`, `margin-inline`, `padding-inline`.
- Avoid hardcoding left/right except shell-specific LTR decisions.
- Every page must be tested in Arabic with long labels and mixed English construction codes.
- Use fonts that render Arabic professionally. Inter is fine for Latin; add an Arabic UI font plan before Arabic UI launch.

### 4.3 Arabic construction terminology baseline

| English | Arabic display candidate |
|---|---|
| Project | مشروع |
| Portfolio | محفظة المشاريع |
| Program | برنامج |
| RFI | طلب معلومات |
| Submittal | اعتماد / تقديم |
| Drawing | مخطط |
| BOQ | جدول الكميات |
| WBS | هيكل تقسيم العمل |
| Schedule | البرنامج الزمني |
| Baseline | خط الأساس |
| Risk | خطر |
| Issue | مشكلة |
| Change Order | أمر تغيير |
| Daily Log | التقرير اليومي |
| Punch List | قائمة النواقص |
| Approval | اعتماد / موافقة |
| Cost Code | كود تكلفة |
| Earned Value | القيمة المكتسبة |

---

## 5. Feature/page map — ultimate product

Legend:

- **Shell:** permanent app chrome, not a feature page.
- **Core:** needed for a serious MVP.
- **V1:** strong first commercial product.
- **V2:** differentiation / intelligence / depth.
- **V3:** ecosystem / enterprise expansion.

### 5.1 Shell-level universal surfaces

| Surface | Type | Phase | Purpose | Key details |
|---|---|---:|---|---|
| App Shell | Shell | Current | Permanent chrome | Left registry menu, main canvas, universal AI panel, page title, browser title |
| Feature Menu | Shell | Current→Core | Shows enabled modules/pages | Registry-driven, tenant customizable, permissions aware, Arabic labels |
| Main Canvas | Shell | Current | Active feature/page area | Only route-changing area; dense desktop; scroll contained |
| Universal AI Assistant | Shell | Current→V1 | Chat/agent surface always available | Collapsible side panel, black FAB when collapsed, citations, tool scopes, no fake replies |
| Global Command Palette | Shell | Core | Keyboard/AI-powered navigation | Search pages, records, actions; `Cmd/Ctrl+K`; Arabic search |
| Global Search | Shell | Core | Search across projects/docs/tasks/RFIs | Lexical + semantic, Arabic-aware, filters by project/type/date |
| Notifications Center | Shell | Core | Central inbox for mentions/approvals/due items | Push/email/WhatsApp later, unread counts, SLA reminders |
| User/Profile Menu | Shell | Core | Account, language, density, org switching | Arabic/English switch, RTL mode, timezone, notification prefs |

---

### 5.2 Foundation / admin modules

| Feature/Page | Phase | Purpose | Pages needed | Key capabilities |
|---|---:|---|---|---|
| Organizations & Tenants | Core | Multi-tenant foundation | Org list, org settings, tenant config | Company profile, legal entities, region, language defaults, modules enabled |
| Users & Members | Core | People access | Members, invitations, roles | Invite users, teams, project assignment, external collaborators |
| Roles & Permissions | Core | Secure project data | Role matrix, project permissions | RBAC, project-level permissions, feature-level access, AI tool scopes |
| Audit Log | Core | Trust/compliance | Audit list, audit detail | Who changed what/when, export, filter by entity/user/action |
| Custom Fields | Core | Tenant customization | Field builder, field usage | Add fields to projects/tasks/RFIs/risks/docs; types, required rules |
| Templates | Core | Speed setup | Project templates, workflow templates, checklist templates | Clone standard projects, approval chains, RFI templates |
| Feature Configuration | Core | Instance customization | Module registry admin | Enable/disable modules, order nav, rename display labels, per-role visibility |
| Settings | Current→Core | App/org setup | General, language, integrations, security | Arabic/English, date/number formats, timezone, API keys later |

---

### 5.3 Today / Command Center

| Feature/Page | Phase | Purpose | Pages needed | Key capabilities |
|---|---:|---|---|---|
| Today Dashboard | Core | Role-based daily command page | Today, My work, Due soon | My approvals, due tasks, risks, RFIs waiting, schedule alerts, AI brief |
| Executive Home | V1 | Portfolio overview | Executive dashboard | Portfolio health, CPI/SPI, delayed projects, risk heatmap, cashflow snapshot |
| Project Manager Home | V1 | PM work cockpit | PM dashboard | Open actions, lookahead, approvals, budget variance, document changes |
| Site Engineer Home | V1 | Field-first work list | Field dashboard | Today inspections, daily log prompt, photos to upload, punch items |
| AI Daily Brief | V1 | AI-generated status | Brief panel/report | Cited summary, yesterday/today/blockers/decisions, Arabic/English |

---

### 5.4 Projects / Programs / Portfolio

| Feature/Page | Phase | Purpose | Pages needed | Key capabilities |
|---|---:|---|---|---|
| Portfolio | Core | Multi-project overview | Portfolio list, portfolio dashboard | Programs/projects hierarchy, status, health, budget/schedule indicators |
| Programs | V1 | Group related projects | Program list/detail | Rollup KPIs, shared milestones, strategic objectives |
| Projects | Current→Core | Main project registry | Project list, project detail, project settings | Project metadata, stakeholders, phases, status, location, contract values |
| Project Workspace | Core | One project cockpit | Overview, activity, team, files | Tabs/sections for all project modules, recent activity, pinned records |
| Stakeholders | V1 | Project parties | Stakeholder directory | Owner, consultant, GC, subcontractors, contacts, responsibilities |
| Project Calendar | V1 | Milestones/events | Calendar | Milestones, meetings, due dates, inspections, submissions |

---

### 5.5 Tasks / Work Execution

| Feature/Page | Phase | Purpose | Pages needed | Key capabilities |
|---|---:|---|---|---|
| Tasks | Core | Work tracking | List, board, detail | Tasks, assignees, status, priority, due dates, comments, attachments |
| Work Packages | Core | Construction/WBS work units | WBS tree, package detail | WBS coding, deliverables, linked BOQ/schedule/docs |
| Kanban Board | Core | Visual work flow | Board | Status columns, drag/drop, filters, swimlanes |
| Calendar View | Core | Date-based execution | Calendar | Tasks, inspections, submissions, meetings |
| Timeline View | V1 | Lightweight schedule view | Timeline | Dependencies preview, phases, milestones |
| Checklists | V1 | Repeatable site work | Checklist templates, checklist runs | QA/safety checklists, completion evidence |
| Time Tracking | V1 | Effort/progress | Timesheets, approvals | Hours, productivity, approvals, export |
| Workload | V1 | Team capacity | Workload chart | Capacity by person/team, overloaded warnings |

---

### 5.6 Schedule & Planning

| Feature/Page | Phase | Purpose | Pages needed | Key capabilities |
|---|---:|---|---|---|
| Schedule | Core | Gantt/CPM center | Gantt, activity table, detail drawer | Activities, dependencies FS/SS/FF/SF, critical path, milestones |
| CPM Engine | Core | Schedule calculation | Worker/service, diagnostics page | Forward/backward pass, float, critical path, calendars |
| Baselines | Core | Variance control | Baselines list, compare view | Save baseline, compare dates/durations/float |
| P6/MSP Import | V1 | Industry interoperability | Import wizard, mapping, validation | XER/XML/MSP parsing, WBS/activity/resource mapping, errors report |
| Lookahead Planning | V1 | Field schedule execution | 2–6 week lookahead board | Constraints, commitments, percent plan complete |
| Resource Planning | V1 | Labor/equipment/material plan | Resource histograms, allocation | Resource demand, availability, leveling indicators |
| What-if Scenarios | V2 | Plan alternatives | Scenario list, compare | Duplicate schedule, change durations/resources, compare outputs |
| Schedule Risk | V2 | Predict delay risk | Risk simulation, Monte Carlo | Probability ranges, confidence dates, risk drivers |
| BOQ → WBS/Schedule Draft | V2 | AI/planner acceleration | Import/draft wizard | BOQ parsing, WBS suggestion, activities draft, human review |

---

### 5.7 Cost / Commercial / Controls

| Feature/Page | Phase | Purpose | Pages needed | Key capabilities |
|---|---:|---|---|---|
| Cost Codes / CBS | Core | Cost structure | Cost code tree, mapping | CBS, WBS mapping, BOQ line mapping |
| Budget | Core | Approved cost plan | Budget table, budget detail | Original budget, revisions, transfers, permissions |
| Actuals | V1 | Cost tracking | Actuals import/list | Actual cost entries, ERP import, manual entry controls |
| EVM | V1 | Earned value control | EVM dashboard, snapshots | PV, EV, AC, CPI, SPI, EAC, VAC, trend charts |
| Forecasting | V1 | Cost-to-complete | Forecast worksheet | ETC/EAC, variance explanations, approvals |
| Change Orders | V1 | Scope/cost/time changes | CO log, CO detail, workflow | Potential change, quotation, approval, schedule/cost impact |
| Contracts / Commitments | V2 | Commercial commitments | Contract list/detail | Vendor contracts, POs, subcontract terms, retention |
| Payment Applications | V2 | Invoicing/progress payments | Pay apps, invoice review | Retention, progress %, approvals, export |
| Procurement | V2 | Buyout/material flow | RFQ, bids, vendor compare | RFQs, bid comparison, award, delivery tracking |
| Materials Tracking | V2 | Site material control | Material register, deliveries | Ordered/delivered/installed quantities, shortages |
| Estimating / Takeoff | V3 | Preconstruction depth | Estimate, takeoff viewer | 2D/3D takeoff integration or native later |

---

### 5.8 Risk / Issues / Quality / Safety

| Feature/Page | Phase | Purpose | Pages needed | Key capabilities |
|---|---:|---|---|---|
| Risk Register | Core | Proactive risk control | Risk list, risk detail, matrix | Probability/impact, owner, mitigation, residual risk |
| Issues | Core | Active problems | Issue list/detail | Severity, owner, due date, root cause, linked tasks/docs |
| Risk Matrix | Core | PMO view | 5×5 heatmap | Before/after mitigation, portfolio rollup |
| Escalations | V1 | Management attention | Escalation list | SLA, escalation rules, executive notifications |
| Quality Inspections | V1 | QA/QC process | Inspection templates/runs | Checklists, pass/fail, evidence, NCR generation |
| NCR / Nonconformance | V1 | Quality defect workflow | NCR log/detail | Cause, corrective action, approval, closeout |
| Safety | V1 | HSE control | Safety inspections, incidents | Incidents, toolbox talks, safety observations |
| Predictive Risk AI | V2 | Early warning | Risk insights | Delay/cost/safety signals, cited evidence, human review |

---

### 5.9 Documents / Drawings / Knowledge

| Feature/Page | Phase | Purpose | Pages needed | Key capabilities |
|---|---:|---|---|---|
| Documents | Core | Project document control | Doc registry, upload, detail | Metadata, folders, permissions, versions, approval status |
| Version Control | Core | Prevent outdated work | Revision history, compare | Approved/current revision, superseded flags, audit trail |
| Searchable Specs | Core | Find answers fast | Spec search, result viewer | Full-text search, Arabic search, semantic search later |
| Drawings | V1 | Sheet management | Drawing register, sheet viewer | Sheet sets, revisions, discipline, status |
| Markups & Pins | V1 | Field/design coordination | PDF/drawing viewer | Markups, pins, linked RFIs/issues/photos, permissions |
| Transmittals | V1 | Formal document distribution | Transmittal log/detail | Recipients, package, acknowledgement, audit |
| Contracts Repository | V1 | Legal/commercial docs | Contract docs | Controlled access, clause search, AI summary |
| Wiki / Lessons Learned | V1 | Organizational memory | Wiki pages, lessons | PM playbooks, templates, lessons learned, Arabic knowledge base |
| BIM Viewer | V2 | Model coordination | Model list/viewer | IFC/Revit/Navisworks integration, issues linked to model |
| AI Extraction | V2 | Document intelligence | Extraction review | BOQ/spec/drawing extraction, human validation |

---

### 5.10 Construction Admin / Field Collaboration

| Feature/Page | Phase | Purpose | Pages needed | Key capabilities |
|---|---:|---|---|---|
| RFIs | V1 | Formal questions | RFI log, RFI detail, create wizard | Workflow, responsible party, due date, attachments, schedule/cost impact |
| Submittals | V1 | Material/shop drawing approvals | Submittal log/detail | Packages, reviewers, cycles, due dates, status, linked specs |
| Daily Logs | V1 | Site diary | Daily log calendar/detail | Labor, equipment, weather, work performed, visitors, photos |
| Punch List / Snagging | V1 | Closeout defects | Punch list, location view | Assign, due, evidence, close, photo annotations |
| Observations | V1 | Field observations | Observation list/detail | Safety/quality/general, assign, link to drawing/location |
| Meeting Minutes | V1 | Decisions/actions | Meeting list/detail | Agenda, attendees, decisions, action items, AI minutes later |
| Photos & Videos | V1 | Field evidence | Gallery, map/location view | Upload, tag, link to drawing/task/RFI/daily log |
| Inspections | V1 | Site checks | Template/run/detail | QA/safety checklists, signatures, evidence |
| Permits & Compliance | V2 | Regulatory tracking | Permit log/detail | Permit status, expiry, owner, documents, alerts |
| Correspondence | V2 | Formal communication | Correspondence log | Letters, notices, claims, transmittal links |
| Closeout | V2 | Handover package | Closeout dashboard | O&M manuals, warranties, as-builts, punch, final docs |

---

### 5.11 Workflow / Approvals

| Feature/Page | Phase | Purpose | Pages needed | Key capabilities |
|---|---:|---|---|---|
| Approvals Inbox | Core | User action queue | My approvals, approval detail | Approve/reject/comment, SLA, delegated approvals |
| Workflow Builder | V1 | Configurable process | Visual DAG builder | Serial/parallel/conditional steps, roles, thresholds |
| Request Intake | V1 | Standard forms | Request templates, submit request | Change request, procurement request, access request, custom forms |
| SLA & Reminders | V1 | Keep workflows moving | SLA rules | Timers, reminders, escalation, pause/resume rules |
| E-sign Tracking | V2 | Signature control | Sign package/status | Documenso/DocuSign integration, wet-sign tracking |
| Workflow Analytics | V2 | Bottleneck visibility | Workflow dashboard | Average cycle time, overdue, bottlenecks by role/vendor |

---

### 5.12 Collaboration / Communication

| Feature/Page | Phase | Purpose | Pages needed | Key capabilities |
|---|---:|---|---|---|
| Comments Everywhere | Core | Entity-level discussion | Thread component | @mentions, attachments, status changes, audit-aware |
| Project Chat | V1 | Project communication | Channels, DMs | Project channels, linked records, voice notes later |
| Mentions & Notifications | Core | Action delivery | Notification center | Mentions, assignments, approvals, due alerts |
| Email-in | V1 | Capture external comms | Mailbox settings, email records | Forward email into project/RFI/correspondence |
| WhatsApp Integration | V1 | MENA adoption | WhatsApp settings/log | Notifications, approvals links, field updates, policy controls |
| Meetings | V1 | Meeting management | Calendar, meeting detail | Agenda, attendees, minutes, action items |
| AI Meeting Minutes | V2 | Reduce admin | Transcript/minutes review | Transcription, summary, action extraction, human approval |
| Team Directory | V1 | People context | Directory, profile | Skills, company, role, projects, contact methods |

---

### 5.13 PMO / Strategy / Analytics

| Feature/Page | Phase | Purpose | Pages needed | Key capabilities |
|---|---:|---|---|---|
| Portfolio Health | Core | Executive overview | Portfolio dashboard | Red/amber/green, schedule, cost, risk, approvals, field health |
| Program Dashboards | V1 | Program control | Program health | Rollups by program/client/region |
| KPI Tree | V1 | Strategy linkage | KPI builder, KPI dashboard | Strategy goals, BSC/OKR, project contribution |
| Benefits Tracking | V2 | Value realization | Benefits register | Planned vs realized benefits, owner, timeline |
| Report Builder | V1 | Custom reporting | Report designer | Tables/charts, filters, saved reports, scheduled export |
| Executive Briefing Packs | V1 | Board-ready outputs | Briefing generator | PDF/PowerPoint export, AI narrative with citations |
| Analytics Warehouse Export | V2 | BI integration | Export settings | Power BI/warehouse sync, governed datasets |
| Engagement Analytics | V2 | Adoption visibility | Usage dashboard | WAU, stale projects, response times, module usage |

---

### 5.14 AI Layer — universal + embedded agents

AI is a platform layer and a shell surface. It must never hallucinate unchecked actions.

| AI Capability | Phase | Surface | Behavior |
|---|---:|---|---|
| Universal AI Chat | Current→Core | Shell panel | Ask about current page/project/docs; no fake replies before adapter |
| Cited Project Q&A | Core | Shell + docs/tasks | Answers cite documents/records/links |
| AI Daily Brief | V1 | Today dashboard | Generates daily brief with blockers/actions/risks |
| Report Writer | V1 | Reports/PMO | Drafts weekly/monthly reports with cited facts |
| RFI Assistant | V1 | RFI module | Finds similar RFIs, drafts response/request, human review required |
| Submittal Assistant | V1 | Submittals | Checks specs, generates review checklist, flags missing docs |
| Schedule Explainer | V1 | Schedule | Explains critical path, slippage, float changes |
| Risk Scorer | V2 | Risk | Suggests risk score, mitigation, evidence; human confirms |
| BOQ/Schedule Generator | V2 | BOQ/Schedule | Drafts WBS/activities from BOQ/specs; planner approves |
| Meeting Notetaker | V2 | Meetings | Transcript, decisions, action items, Arabic summary |
| Voice Field Input | V2 | Mobile | Arabic/English voice notes → structured daily log/task/issue |
| Agent Studio / Tools Registry | V3 | Admin/AI | Tenant-controlled tools, scopes, approvals, audit |

AI safety rules:

- Every AI answer must show citations where data-backed.
- Every AI-generated workflow item must be marked `draft` until accepted.
- AI cannot approve money, contracts, changes, or safety closure without explicit human action.
- AI tools must run under permission scopes; user cannot ask AI to access hidden records.
- Arabic AI must support Arabic questions over Arabic and English documents.

---

### 5.15 Integrations / Ecosystem

| Integration | Phase | Purpose | Details |
|---|---:|---|---|
| P6 / XER / XML | V1 | Schedule interoperability | Import/export activities, WBS, calendars, relationships |
| MS Project | V1 | Schedule interoperability | Import/export MSP/MPP via library/service |
| ERP / Accounting | V2 | Cost actuals/contracts | Sage, QuickBooks, Odoo, ERPNext, SAP/Oracle later |
| SharePoint / Drive / S3 | V1 | Document storage | Sync/import/export, permissions mapping |
| Email / Microsoft 365 / Google | V1 | Calendar/email integration | Meetings, email-in, notifications |
| WhatsApp Business API | V1 | MENA workflows | Notifications, approval links, field updates |
| Teams / Slack / Telegram | V2 | Collaboration | Alerts, bot commands, summaries |
| E-sign | V2 | Approval/legal | Documenso/DocuSign integration |
| BIM / IFC / Revit / Navisworks | V2 | Model coordination | Model viewer, issue pins, clash links |
| Reality Capture | V3 | Progress AI | Buildots/OpenSpace-style integrations |
| BI / Warehouse | V2 | Analytics export | Power BI, BigQuery/Snowflake/Postgres views |
| Public API + Webhooks | Core→V1 | Extensibility | REST/OpenAPI, webhooks, service accounts |
| Marketplace | V3 | Ecosystem | Admin-installable connectors/tools |

---

## 6. Navigation proposal

### 6.1 Default primary nav for dense desktop

Initial enabled nav should stay focused, not show every future module at once.

| Order | Label | Route | Phase | Notes |
|---:|---|---|---:|---|
| 10 | Today | `/` | Core | Replace current Overview label when real page starts |
| 20 | Projects | `/projects` | Core | Portfolio/project registry |
| 30 | Tasks | `/tasks` | Core | Work execution |
| 40 | Schedule | `/schedule` | Core | Gantt/CPM |
| 50 | Documents | `/documents` | Core | Docs/specs/files |
| 60 | Risks | `/risks` | Core | Risk/issue register |
| 70 | Approvals | `/approvals` | Core | Workflow inbox |
| 80 | Controls | `/controls` | V1 | Cost/EVM/change controls group |
| 90 | Field | `/field` | V1 | RFI/submittal/daily/punch/drawings group |
| 100 | Reports | `/reports` | V1 | Analytics/report builder |
| 900 | Settings | `/settings` | Core | Org/app/admin |

Footer:

| Label | Route | Notes |
|---|---|---|
| Profile | `/profile` | User/account/language |
| Logout | `/logout` | Auth exit later |

### 6.2 Grouped module pages

Because the app will be large, some nav items should open a module group landing page first:

- **Controls:** Budget, Cost Codes, EVM, Forecast, Change Orders, Contracts, Procurement.
- **Field:** Drawings, RFIs, Submittals, Daily Logs, Punch, Photos, Inspections, Safety.
- **Reports:** Portfolio health, custom reports, executive briefings, exports.
- **Admin/Settings:** Members, permissions, feature config, workflows, integrations.

---

## 7. Recommended build sequence

### Phase 0 — Current shell hardening (now)

Already started/done:

- Shell layout.
- Registry-loaded empty feature routes.
- Universal AI panel UI.
- Dense GUI sizing rules.
- Railway deploy loop.

Remaining shell hardening before big features:

1. Add app-wide i18n infrastructure (`en`, `ar`) with RTL toggle.
2. Add feature config shape: enabled/disabled/order/title override.
3. Add shared UI primitives: button, input, table, card, toolbar, badge, empty/loading/error.
4. Add shared page layout primitives following `GUI_SIZING_RULES.md`.
5. Replace placeholder feature labels with final nav map gradually.

### Phase 1 — Core PMO wedge

Build first real pages:

1. **Today / Command Center** — role-based empty/real layout, AI brief placeholder connected to real adapter later.
2. **Projects** — project list/detail/settings; this is the root of everything else.
3. **Tasks / Work Packages** — list/board/detail; comments; attachments.
4. **Documents** — file registry, metadata, upload flow placeholder, version model.
5. **Risks & Issues** — risk register, 5×5 matrix, issue log.
6. **Approvals** — inbox and simple configurable approval flow model.
7. **Global Search / Command Palette** — search and navigation foundation.
8. **Arabic/RTL infrastructure** — must land in this phase, not later.

### Phase 2 — Schedule + controls

1. **Schedule/Gantt** — activity table + Gantt view + dependencies.
2. **CPM worker** — critical path, float, baselines.
3. **P6/MSP import wizard** — validation-first.
4. **Budget / Cost Codes / EVM** — simple but real controls.
5. **Portfolio health dashboard** — schedule/cost/risk rollups.
6. **Report builder v1** — saved filters and PDF/Excel export.

### Phase 3 — Construction field depth

1. Drawings registry/viewer.
2. RFIs.
3. Submittals.
4. Daily logs.
5. Punch list.
6. Photos/videos linked to records.
7. Inspections/safety.
8. Meeting minutes.

### Phase 4 — AI agents

1. Cited project Q&A.
2. Daily brief.
3. RFI/submittal drafting.
4. Schedule delay explanation.
5. Risk scoring.
6. Report writer.
7. Meeting notetaker.
8. Voice field input.

### Phase 5 — Commercial + enterprise ecosystem

1. Contracts/commitments.
2. Payment applications/retention.
3. Procurement/RFQ/vendor comparison.
4. ERP/accounting sync.
5. BIM/reality capture integrations.
6. BI warehouse export.
7. Marketplace/agent studio.

---

## 8. Data model backbone

The product should be designed around these canonical entities:

### 8.1 Platform entities

- Tenant / organization
- Workspace / business unit
- User
- Team
- Role
- Permission policy
- Audit event
- Feature flag / module config
- Custom field definition
- Notification
- Attachment
- Comment thread

### 8.2 Project entities

- Portfolio
- Program
- Project
- Stakeholder / company
- Project member
- Location / zone / level / room
- Work package
- Task
- Checklist
- Milestone

### 8.3 Controls entities

- WBS node
- Schedule activity
- Dependency
- Calendar
- Baseline
- Resource
- Cost code / CBS node
- BOQ line
- Budget line
- Actual cost
- EVM snapshot
- Forecast line
- Change order
- Contract / commitment
- Invoice / payment application

### 8.4 Construction admin entities

- Document
- Document revision
- Drawing sheet
- Markup / pin
- RFI
- Submittal
- Daily log
- Punch item
- Observation
- Inspection
- Incident
- Meeting
- Transmittal
- Correspondence

### 8.5 Intelligence entities

- AI conversation
- AI message
- AI citation
- AI tool call
- AI draft action
- AI agent config
- Knowledge source
- Embedding/index job

---

## 9. Page quality checklist

Every real page must include:

- [ ] Arabic + English labels planned.
- [ ] RTL layout checked or explicitly deferred with gap.
- [ ] Loading state.
- [ ] Empty state.
- [ ] Error state.
- [ ] Permission-denied state.
- [ ] Audit events for meaningful changes.
- [ ] Keyboard accessible controls.
- [ ] Dense desktop sizing from `design/GUI_SIZING_RULES.md`.
- [ ] No fake production data.
- [ ] Tests for main behavior.
- [ ] Route title and browser title correct.
- [ ] AI context handoff defined if page data should be visible to assistant.

---

## 10. Immediate next implementation recommendation

The next best build step is **not** a deep construction module yet. It should be the reusable foundation that all feature pages need:

1. **Shared UI primitives + page layout primitives** following `GUI_SIZING_RULES.md`.
2. **i18n/RTL infrastructure** with Arabic-ready labels.
3. **Feature config manifest shape** so the menu can actually be instance-customized.
4. Then build **Projects** as the first real feature page because every other module attaches to projects.

Recommended next page order:

```text
1. Shared UI + i18n/RTL + feature config
2. Projects
3. Today
4. Tasks / Work Packages
5. Documents
6. Risks / Issues
7. Approvals
8. Schedule
9. Controls
10. Field modules
```

---

## 11. Append-only decision log

### 2026-07-23 — Initial blueprint

- Consolidated Rectangle as an Arabic-first AI-native construction/PMO operating system.
- Confirmed shell split: feature menu + main canvas + universal AI assistant.
- Defined complete feature universe, phases, nav proposal, data backbone, and Arabic/RTL requirements.
- Immediate next recommendation: shared UI/i18n/feature config, then Projects as first real feature.
