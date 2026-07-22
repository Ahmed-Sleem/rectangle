# Information Architecture & Module Organization

## 1. How vendors group modules

### Procore — lifecycle + role
```
Preconstruction | Project Execution | Cost | Resources | Lifecycle | AI
```
Maps to **job phases** and **money/people**.

### Tornix — stakeholder PMO
```
Execution (5) | Collaboration (4) | Cost & Control (4) | Intelligence (3)
```
Maps to **PMO textbook** + AI.

### OpenProject — PMBOK-ish
```
Portfolio | Planning | Work packages | Agile | Time | Collab | Wiki | Budgets
```

### Plane — product team
```
Projects | Wiki | AI | Desk
```

### ACC — workflow
```
Docs | Bid | Model | Project mgmt | AI
```

### ALICE — schedule only
```
Plan | Optimize | Model
```

## 2. Object model comparison

| Object | Procore | P6 | OpenProject | Plane | Tornix |
|--------|---------|----|-------------|-------|--------|
| Container | Project | Project/EPS | Project | Project | Project |
| Schedule unit | Schedule activities (integrated) | Activity | Work package dates | Work item dates | Tasks + Gantt |
| Field issue | RFI/Observation/Punch | — | — | Work item custom | Risks/Issues + tasks |
| Money | Budget line / commitment | via Unifier | Budget | — | Costs/EVM |
| Doc | Drawing revision | — | Attachment/Document | Wiki/files | Documents |
| AI | Helix agents | CIC add-on | MCP external | Plane AI | Super Agent |

## 3. Recommended module packaging for build

### Package P0 — Foundation (months 0–3)
Org, users, RBAC, projects, tasks multi-view, files, notifications, AR/EN, mobile shell, audit

### Package P1 — PMO Core (3–6)
Gantt+CPM lite, dependencies, baselines, risk register 5×5, dashboard Today, approvals, documents versioning, time tracking

### Package P2 — Controls (6–9)
Cost codes, budget vs actual, EVM snapshots, P6 import, BOQ import → WBS draft, portfolio rollup, strategy KPI tree

### Package P3 — Construction Field (9–14)
Drawings + pins, RFI, submittals, daily log, punch, photos

### Package P4 — AI Agents (parallel from P1)
Q&A with citations, daily brief, report writer, risk scorer, schedule impact explain; agent permissions

### Package P5 — Commercial depth (14+)
Procurement, contracts, invoices/retention, change orders financial, ERP sync

### Package P6 — Ecosystem
WhatsApp, Procore/ACC one-way sync, Buildots/OpenSpace embed, marketplace

## 4. Cross-cutting “platforms” inside the product
Not modules — **capabilities every module uses**:
- Workflow engine  
- Comment/chat thread on any entity  
- @notify  
- Custom fields  
- Templates  
- Attachments  
- AI tools registry  
- Export/print  

## 5. Naming for MENA market
Support dual labels:
- RFI = طلب معلومات  
- Submittal = اعتماد مواد / تقديمات  
- Punch = قائمة النواقص  
- BOQ = جدول الكميات  
- WBS = هيكل تقسيم العمل  
- EVM = القيمة المكتسبة  

Keep English codes in data model (`rfi`, `boq_line`) for integrations.
