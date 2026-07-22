# Forkable / Extendable Applications

Full products you can **run, white-label, fork, or mine for modules**.  
Detail profiles also in `../open-source/`.

## Tier A — Strongest bases for a Tornix-like product

### 1. Plane (makeplane/plane)
| | |
|--|--|
| **URL** | https://github.com/makeplane/plane · https://plane.so |
| **Stack** | Django + React (Next historically → Vite/RR migration notes) · Postgres · Redis · S3 |
| **License** | Open core — **verify current LICENSE before commercial fork** |
| **Mode** | FORK (work mgmt + AI UX) or REFERENCE |
| **Take** | Best modern AI-native PM UX. **Add** construction objects, EVM, P6, AR RTL, drawings. |
| **Avoid** | Assuming construction RFIs exist out of box |

### 2. OpenProject (opf/openproject)
| | |
|--|--|
| **URL** | https://github.com/opf/openproject |
| **Stack** | Rails 8 + Angular · Postgres · Redis · Grape API |
| **License** | **GPLv3** + Enterprise |
| **Mode** | REFERENCE (permissions, Gantt, EVM concepts) · FORK only with GPL strategy |
| **Take** | Deep hybrid PM, budgets, portfolios, BIM edition exists |
| **Avoid** | Dropping GPL into proprietary monorepo without counsel |

### 3. ERPNext / Frappe
| | |
|--|--|
| **URL** | https://github.com/frappe/erpnext · frappe/frappe |
| **Stack** | Python Frappe · MariaDB/Postgres · JS Desk |
| **License** | GPLv3 |
| **Mode** | INTEGRATE (accounting/projects) or FORK vertical |
| **Take** | DocTypes, workflows, project costing, timesheets → invoices |
| **Avoid** | Using Desk UI as field product |

### 4. Odoo (Community)
| | |
|--|--|
| **URL** | https://github.com/odoo/odoo |
| **License** | LGPL-3 (CE); many apps Enterprise proprietary |
| **Mode** | INTEGRATE / FORK CE modules |
| **Take** | Project, Purchase, Accounting, Planning |
| **Avoid** | Edition confusion |

## Tier B — Specialized apps to integrate or embed patterns

| App | URL | Use |
|-----|-----|-----|
| **Taiga** | github.com/taigaio | Agile boards REFERENCE |
| **Leantime** | github.com/Leantime/leantime | Goals/lean PM REFERENCE |
| **Kanboard** | github.com/kanboard/kanboard | Minimal kanban REFERENCE |
| **Vikunja** | github.com/go-vikunja/vikunja | Tasks API REFERENCE |
| **Focalboard** | github.com/mattermost/focalboard | Boards + Mattermost chat pair |
| **ProjectLibre** | sourceforge/projectlibre | Desktop CPM UI REFERENCE |
| **GanttProject** | github.com/bardsoftware/ganttproject | Teaching Gantt/CPM REFERENCE |
| **NocoBase** | github.com/nocobase/nocobase | Plugin platform FORK vertical apps |
| **Budibase** | github.com/Budibase/budibase | Internal admin/approvals fast |
| **Appsmith** | github.com/appsmithorg/appsmith | Internal tools |
| **Documenso** | github.com/documenso/documenso | E-sign INTEGRATE |
| **Outline** | github.com/outline/outline | Wiki/knowledge INTEGRATE or REFERENCE |
| **AppFlowy** | github.com/AppFlowy-IO/AppFlowy | Docs REFERENCE |
| **Twenty** | github.com/twentyhq/twenty | CRM only — sales side |
| **Metabase** | github.com/metabase/metabase | BI dashboards INTEGRATE |
| **Cube** | github.com/cube-js/cube | Semantic layer analytics |
| **Directus** | github.com/directus/directus | Headless CMS/API on SQL |
| **Hasura** | github.com/hasura/graphql-engine | Instant GraphQL on Postgres |
| **Supabase** | github.com/supabase/supabase | Auth+DB+storage+realtime starter |
| **Appwrite** | github.com/appwrite/appwrite | BaaS alternative |
| **Tooljet** | github.com/ToolJet/ToolJet | Internal tools |
| **Windmill** | github.com/windmill-labs/windmill | Script/ops workflows (AGPL check) |
| **Activepieces** | github.com/activepieces/activepieces | MIT Zapier-like |
| **Automatisch** | github.com/automatischio/automatisch | Zapier-like |
| **Formbricks** | github.com/formbricks/formbricks | Surveys/feedback |
| **Cal.com** | github.com/calcom/cal.com | Scheduling meetings |
| **Rallly** | github.com/lukevella/rallly | Polls |
| **Plane Desk** | (product roadmap) | Support desk patterns |

## Tier C — Construction-adjacent OSS (rare)

True open-source **Procore clones** are scarce. Practical approach:

| Resource | Notes |
|----------|-------|
| OpenProject BIM edition | Model + PM hybrid |
| That Open / IFC.js / xeokit demos | Field 3D later |
| Bluebeam is commercial | Don’t plan on OSS equivalent at parity |
| Custom on NocoBase/Frappe | Build RFI/submittal DocTypes |

## Fork decision matrix

| If you want… | Do this |
|--------------|---------|
| Fastest pretty PM + AI | Start from **Plane** concepts; greenfield schema for construction |
| Fastest controls/Gantt/EVM concepts | Study **OpenProject**; reimplement MIT stack |
| Fastest money/approvals | **ERPNext** as commercial backbone + separate field app |
| Fastest internal MVP | **NocoBase** or Budibase for ops; validate UX; then rewrite core |
| Legal simplicity | **Greenfield MIT stack** + libraries only |

## Anti-pattern
Forking **two** GPL monoliths (OpenProject + ERPNext) into one proprietary product without architecture isolation = license and merge hell.
