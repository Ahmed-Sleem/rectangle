# ERPNext & Odoo — Projects inside ERP

## Why this category matters
Tornix cost/procurement/EVM eventually collides with **accounting truth**. ERPNext/Odoo show how OSS handles project financials without Procore.

---

## ERPNext (Frappe)

| | |
|--|--|
| **Stack** | **Frappe Framework** — Python + JS, MariaDB/Postgres options historically MariaDB-centric |
| **Model** | Metadata **DocTypes**, serverscripts, workflow engine |
| **Projects module** | Project + Task DocTypes |

### Project capabilities (docs/deepwiki VERIFIED themes)
- Tasks with hierarchy, dependencies (`depends_on`), reschedule dependents  
- % complete methods: Manual, Task Completion, Task Progress, Task Weight  
- Timesheets → costing & billing rollup  
- Purchase + sales invoice aggregation on project  
- Gantt + Kanban views from project  
- Templates  
- Integration with HR, Stock, Accounts, CRM  

### GUI
- Desk UI: form-centric ERP (list → form)  
- Not field-drawing native  
- Highly customizable without code via Customize Form  

### Architecture strengths
- Workflow engine multi-level approvals  
- Permissions by role/doctype  
- REST/JSON-RPC  
- Good base if product pivots to **SME contractor ERP+PM**  

### Weak for Tornix day-1
- No native RFI/drawing pin  
- UX not “AI PMO sleek”  
- Construction vertical needs heavy customization (there are community construction apps)

---

## Odoo Project

| | |
|--|--|
| **Model** | Open core; many features enterprise  
| **Stack** | Python, PostgreSQL, OWL JS framework  
| **Modules** | Project, Timesheet, Planning, Field Service, Accounting, Purchase |

### Strengths
- Huge app ecosystem  
- Gantt, tasks, profitability  
- Can approximate contractor ops with apps  

### Weak
- Edition fragmentation  
- Construction depth via partners not core  
- UX inconsistent across modules  

---

## Strategic options
1. **Embed** — Tornix-like remains system of engagement; sync costs to ERPNext/Odoo/SAP.  
2. **Build on Frappe** — faster vertical ERP; slower pretty AI UX.  
3. **Hybrid** — Frappe for commercial DocTypes + separate React app for field/AI (similar to dual-stack pattern).
