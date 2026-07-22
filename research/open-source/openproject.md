# OpenProject — Deep Profile (OSS)

| | |
|--|--|
| **Site** | https://www.openproject.org |
| **License** | GPLv3 Community; Enterprise add-ons paid |
| **GitHub** | github.com/opf/openproject |
| **Positioning** | Leading open-source classic / agile / hybrid PM |
| **Customers cited** | Siemens, Deutsche Bahn, Fraunhofer, Linux Foundation, Greenpeace… |
| **Stats (site)** | 20M+ downloads, 285 contributors, 110k+ commits |

## Editions
- **Community** — free self-host, wide feature set  
- **Enterprise on-prem** — support, SSO/LDAP class features, security add-ons  
- **Enterprise cloud** — EU/DE hosting  

Note: Community users sometimes discuss enterprise_token patches for SSO — legally grey/community practice; for product strategy assume **SSO is paid enterprise** unless you build yourself.

## Feature modules (VERIFIED structure)

### Portfolio
- Project lists, favorites, hierarchies  
- Portfolios / programs / projects  
- Project overview dashboards + widgets  
- Life cycle phases & gates  
- Templates  
- My Page personal dashboard  
- Activity streams  
- Multi-project filters  

### Planning
- **Gantt** with dependencies (flagship strength)  
- Baselines (enterprise fullness varies)  
- Scheduling auto/manual  
- Milestones  
- Team planner (calendar assign)  

### Work packages
- Unified object: task, feature, bug, milestone…  
- Custom types, fields, workflows, roles  
- Hierarchy / relations  

### Agile
- Backlogs, sprints  
- Scrum/Kanban boards (some board automation enterprise)  

### Time & cost
- Time tracking daily/weekly  
- Labour costs, budgets  
- **Earned value** style reporting on community (called out vs Plane)  

### Collaboration
- Wiki  
- Forums  
- Meetings module  
- Real-time collaborative Documents (v17+)  
- Notifications  

### Platform
- REST API HAL+JSON  
- Webhooks  
- GitHub/GitLab, Nextcloud, OneDrive (ent), Zapier  
- MCP Server (v17.0 cited)  
- BIM edition mentioned for construction/engineering self-host  

## GUI / UX

| Aspect | Reality |
|--------|---------|
| Look | Functional, somewhat dated vs Plane/Linear (recurring review theme) |
| Density | High — powerful filters, query engine |
| Learning curve | Steeper for non-PMs |
| Gantt | Best-in-class among OSS |
| Boards | Available; polish behind Plane |
| i18n | Strong multi-language; check AR completeness before promising |

### UX patterns
- Global **query / filter** system saved as views  
- Left module navigation per project  
- Work package split view (list + detail)  
- Baseline Gantt comparison for controls culture  

## Backend / architecture — VERIFIED (DeepWiki / project docs)

| Layer | Tech |
|-------|------|
| Backend | **Ruby on Rails ~8**, Ruby ~3.4 |
| API | **Grape**, HAL+JSON API v3 |
| Frontend | **Angular** SPA (~20.x) + Stimulus/Turbo progressive enhancement |
| DB | **PostgreSQL** |
| Cache/jobs | **Redis**, GoodJob |
| Plugins | Rails Engines under `modules/*` |
| Realtime collab | Hocuspocus (docs) in all-in-one images |
| Deploy | Docker all-in-one or multi-service; package installs |

### Architecture characteristics
- Modular engines = feature flags / editions  
- Mature permission model  
- Good for regulated self-host (gov, universities)  

## AI
- **No production AI** comparable to Plane (2026 comparisons)  
- Supportive AI direction mentioned in roundups — treat as weak/nascent  
- MCP server = hook for external agents (interesting for your stack)

## Fit for Tornix-like build

| Use | Recommendation |
|-----|----------------|
| Fork as base | Possible but Rails+Angular is heavy; GPL copyleft implications |
| Integrate | Import work packages / use as internal PM |
| Steal ideas | Gantt+EVM+portfolio+permissions model |
| Not steal | Dated default UX |

**Closest OSS to Tornix “PMO + Gantt + cost”** without construction RFIs.
