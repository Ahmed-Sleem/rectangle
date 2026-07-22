# Build Recommendations — Future Tornix-like Service

## 1. Product thesis (one paragraph)

Build an **AI-native project controls and PMO workspace** for **MENA construction and engineering organizations**, Arabic-first RTL with full English parity, that makes executives and PMs run portfolios from a **daily AI brief**, keeps **schedule/cost/risk** connected (CPM + EVM lite + risk matrix), speaks **P6/MSP file dialects**, and grows into field construction tools (drawings, RFI, submittals) without requiring Procore-priced complexity on day one.

## 2. Non-goals (v1)
- Replace Primavera as enterprise standard scheduler for mega programs  
- Build Buildots-class computer vision  
- Full ERP accounting  
- 400-app marketplace  

## 3. MVP scope (shippable story)

**User story:**  
“A bilingual PM opens Today, sees critical risks and AI actions, updates tasks offline on site, leadership sees portfolio health and CPI/SPI, planner imports P6 XML, documents stay versioned, approvals don’t live in WhatsApp alone.”

**Modules:** see taxonomy MVP cut in `02-feature-taxonomy.md` + packages P0–P2 in `03-ia-module-organization.md`.

## 4. UX principles (locked)
1. Role-skinned home  
2. Every AI answer cites records  
3. Drawing/field flows thumb-first (even if drawings land P3)  
4. RTL is default-quality, not mirrored leftover  
5. Progressive tool disclosure  
6. Agent actions require policy (especially money)  

## 5. Architecture principles (locked)
1. Postgres multi-tenant row model  
2. Separate CPM worker  
3. Event log for audit  
4. AI tools = explicit registered functions  
5. Integration-first (P6, identity, chat)  
6. Feature flags per tenant  

## 6. Suggested build sequence (12 months indicative)

| Quarter | Outcome |
|---------|---------|
| Q1 | Auth, orgs, projects, tasks views, files, AR/EN, Today dashboard, mobile read |
| Q2 | Gantt/CPM lite, dependencies, risks, approvals, docs versions, AI Q&A+brief |
| Q3 | Costs/EVM, P6 import, portfolio, strategy KPIs, WhatsApp notifications |
| Q4 | Drawings+pins, RFI, daily log, punch; agent expansion; first paid pilots |

## 7. OSS leverage matrix

| Component | Leverage |
|-----------|----------|
| Ideas from OpenProject | Permissions, Gantt behaviors, EVM concepts |
| Ideas from Plane | AI UX, views, agent assignee |
| Frappe | Optional commercial DocTypes later |
| Code fork | Prefer greenfield or MIT libs; legal review if forking |
| Bryntum/dhtmlx | Evaluate paid Gantt for speed vs OSS |

## 8. Competitive positioning sentence
“Unlike Procore, we’re Arabic-first and PMO-AI-first at mid-market speed. Unlike Plane/OpenProject, we speak construction controls and P6. Unlike P6, the whole team actually opens the app daily.”

## 9. Validation plan before heavy build
1. 5 PM interviews (KSA/EG contractors)  
2. Clickable prototype of Today + Risk + Gantt  
3. P6 sample import test  
4. Pricing willingness vs Procore/Zoho  
5. WhatsApp workflow shadowing on a live site  

## 10. Metrics that matter
- WAU site engineers  
- % approvals in-app vs WhatsApp  
- Time-to-first-project < 1 day  
- AI recommendation accept rate  
- Schedule update freshness  
- Logo retention at 90 days  
