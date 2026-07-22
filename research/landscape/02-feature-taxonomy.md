# Feature Taxonomy — Normalized Model for a Tornix-like Product

Use this as the **master checklist** when scoring competitors or scoping MVP.  
Mapped to Tornix modules + market reality.

## T0 — Platform foundation

| ID | Capability | Notes |
|----|------------|-------|
| T0.1 | Multi-tenant orgs / workspaces | Company → portfolio → project |
| T0.2 | RBAC + project-level permissions | Fine-grained |
| T0.3 | SSO / SAML / OIDC / Google / Apple | Enterprise must |
| T0.4 | Audit log | Approvals, doc versions, financials |
| T0.5 | i18n + **RTL Arabic** | First-class, not bolt-on |
| T0.6 | REST/GraphQL API + webhooks | Integration fabric |
| T0.7 | Mobile iOS/Android + offline | Field non-negotiable |
| T0.8 | Notifications (push, email, Telegram/WhatsApp) | MENA: WhatsApp critical |
| T0.9 | File storage + virus scan + CDN | Drawings are huge |
| T0.10 | Search (lexical + semantic) | Specs, RFIs, chat |

## T1 — Work & execution

| ID | Capability |
|----|------------|
| T1.1 | Projects / programs / portfolio hierarchy |
| T1.2 | Tasks / work packages / issues |
| T1.3 | Kanban / list / calendar / timeline views |
| T1.4 | Dependencies (FS/SS/FF/SF) |
| T1.5 | Milestones & phases / stage gates |
| T1.6 | Checklists / subtasks |
| T1.7 | Templates (project + task + checklist) |
| T1.8 | Workload / capacity views |
| T1.9 | Time tracking / timesheets |
| T1.10 | Recurring work |

## T2 — Construction-specific collaboration

| ID | Capability | Procore-class |
|----|------------|---------------|
| T2.1 | Drawings / sheets + version sets | Yes |
| T2.2 | Markups / pins on drawings | Yes |
| T2.3 | RFI workflow | Yes |
| T2.4 | Submittals log + workflow | Yes |
| T2.5 | Daily log / site diary | Yes |
| T2.6 | Punch list / snagging | Yes |
| T2.7 | Observations / issues | Yes |
| T2.8 | Inspections / checklists (Q&S) | Yes |
| T2.9 | Incidents / safety | Yes |
| T2.10 | Photos/videos linked to location | Yes |
| T2.11 | Change orders | Yes |
| T2.12 | Meeting minutes (site) | Partial |
| T2.13 | Correspondence / transmittals | Aconex-strong |
| T2.14 | Bid / tender management | Yes |

## T3 — Schedule & controls

| ID | Capability |
|----|------------|
| T3.1 | Gantt interactive |
| T3.2 | CPM engine (true critical path) |
| T3.3 | Baselines & variance |
| T3.4 | Resource leveling / histograms |
| T3.5 | P6 XER / XML import-export |
| T3.6 | MS Project import-export |
| T3.7 | Look-ahead / pull planning boards |
| T3.8 | Schedule risk / Monte Carlo |
| T3.9 | What-if scenarios |
| T3.10 | BOQ → WBS/schedule generation |

## T4 — Cost, procurement, commercial

| ID | Capability |
|----|------------|
| T4.1 | Budget / cost codes / CBS |
| T4.2 | Commitments / contracts / POs |
| T4.3 | Actuals vs budget |
| T4.4 | EVM (PV, EV, AC, CPI, SPI, EAC) |
| T4.5 | Invoices / payment applications / retention |
| T4.6 | Change order cost impact |
| T4.7 | Cash flow forecast |
| T4.8 | Procurement RFQ/RFP |
| T4.9 | Vendor / subcontractor registry |
| T4.10 | Estimating / takeoff (or integrate) |
| T4.11 | Materials tracking |

## T5 — Risk & quality

| ID | Capability |
|----|------------|
| T5.1 | Risk register |
| T5.2 | Probability × impact matrix (5×5) |
| T5.3 | Mitigation actions linked to tasks |
| T5.4 | Issue vs risk distinction |
| T5.5 | Escalation paths |
| T5.6 | Predictive delay risk (ML) |
| T5.7 | Quality non-conformance |

## T6 — Documents & knowledge

| ID | Capability |
|----|------------|
| T6.1 | Doc registry + metadata |
| T6.2 | Version control + locked approved revs |
| T6.3 | Specs searchable |
| T6.4 | Contracts repository |
| T6.5 | Wiki / PM library / lessons learned |
| T6.6 | BIM / model viewer (optional) |
| T6.7 | CAD/PDF markup |
| T6.8 | Blueprint/BOQ extraction (AI) |

## T7 — Workflow & approvals

| ID | Capability |
|----|------------|
| T7.1 | Configurable approval chains |
| T7.2 | Visual workflow / DAG builder |
| T7.3 | Parallel / serial / conditional steps |
| T7.4 | SLA timers & reminders |
| T7.5 | E-sign / wet-sign tracking |
| T7.6 | Request intake templates |

## T8 — Strategy & PMO

| ID | Capability |
|----|------------|
| T8.1 | Portfolio dashboards |
| T8.2 | Strategic goals / OKR or BSC |
| T8.3 | KPI tree linked to projects |
| T8.4 | Benefits tracking |
| T8.5 | Program health rollups |
| T8.6 | Resource demand vs capacity (org) |
| T8.7 | Executive briefing packs |

## T9 — Collaboration suite

| ID | Capability |
|----|------------|
| T9.1 | Project-scoped chat / threads |
| T9.2 | @mentions, files, voice notes |
| T9.3 | Email-in / shared mailbox linking |
| T9.4 | Meetings + calendar sync |
| T9.5 | Transcription + AI minutes |
| T9.6 | Team directory / skills / sentiment |

## T10 — AI layer

| ID | Capability | Maturity examples |
|----|------------|-------------------|
| T10.1 | NL Q&A on project data | Procore Assist, Plane AI, Autodesk Assistant |
| T10.2 | Status report generation | Many |
| T10.3 | RFI/submittal draft agents | Procore Agent Builder |
| T10.4 | Daily log agent | Procore |
| T10.5 | Schedule agent / delay explain | Helix, nPlan |
| T10.6 | Risk scoring agent | nPlan, Construction IQ |
| T10.7 | Photo progress / safety AI | Buildots, OpenSpace, Helix Photo AI |
| T10.8 | Generative scheduling | ALICE |
| T10.9 | Takeoff / BOQ AI | Togal, Costra |
| T10.10 | Meeting notetaker | Tornix, generic |
| T10.11 | Multi-agent orchestration | Helix “agents talk to each other” |
| T10.12 | Agent auth scopes / human-in-loop | Critical for trust |
| T10.13 | Memory / org playbooks | Tornix “memory agent” |
| T10.14 | Voice AI field input | Mobile |

## T11 — Analytics

| ID | Capability |
|----|------------|
| T11.1 | Role-based home dashboards |
| T11.2 | Portfolio heatmaps |
| T11.3 | Custom report builder |
| T11.4 | Benchmarking / industry insights |
| T11.5 | Export BI (Power BI, warehouse) |
| T11.6 | Activity / engagement analytics |

## T12 — Integrations

| ID | System class |
|----|--------------|
| T12.1 | Accounting / ERP |
| T12.2 | P6 / MSP |
| T12.3 | BIM (Revit, Navisworks) |
| T12.4 | Storage (Drive, SharePoint, Nextcloud) |
| T12.5 | Chat (Teams, Slack, Telegram, WhatsApp Business API) |
| T12.6 | Identity (Azure AD, Okta) |
| T12.7 | Reality capture tools |
| T12.8 | Email (Google/MS) |
| T12.9 | E-sign |
| T12.10 | Marketplace / app ecosystem |

---

## MVP vs later (suggested cut for a Tornix-like v1)

### MVP (wedge)
T0 (core), T1, T3.1–T3.6 + T3.10 light, T4.1–T4.4, T5.1–T5.3, T6.1–T6.5, T7.1–T7.4, T8.1+T8.5, T9.1+T9.4+T9.5, T10.1–T10.2+T10.12, T11.1, T12.2+T12.5+T12.6

### v1.5 construction depth
Full T2 (RFI, submittals, drawings, daily, punch)

### v2 intelligence
T10.3–T10.8, T3.8–T3.9, reality-capture integrations

### v3 commercial OS
Deep T4.5–T4.11, Pay, prequal, equipment
