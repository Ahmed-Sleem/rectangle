# Auth, Authorization, Multi-tenancy, Workflows & Approvals

## 1. Authentication (who are you)

| Tool | License | Mode | Notes |
|------|---------|------|-------|
| **Better Auth** | MIT | EMBED | **2026 default** for Next/TS; replaces much Auth.js/Lucia mindshare |
| **Keycloak** | Apache-2.0 | INTEGRATE | Enterprise SSO, SAML, OIDC, LDAP — **must for big contractors** |
| **ZITADEL** | AGPL/Apache parts — verify | INTEGRATE | Multi-tenant IAM SaaS-friendly |
| **Casdoor** | Apache-2.0 | INTEGRATE | UI-first IAM |
| **Supabase Auth** | Apache-2.0 | INTEGRATE | Fast with Supabase stack |
| **Auth.js / NextAuth** | ISC | EMBED | Maintenance-mode narratives 2026 — prefer Better Auth for new |
| **Lucia** | — | ❌ | **Deprecated** → migrate away |
| **Clerk / Auth0 / WorkOS** | Commercial | managed | B2B SSO speed; cost at scale |
| **Ory stack** | Apache-2.0 | INTEGRATE | Kratos (identity) + Hydra (OAuth) + Keto (authz) |

**Google + Apple sign-in:** via Better Auth/Keycloak social IdPs.  
**Enterprise SSO:** Keycloak or WorkOS.

---

## 2. Authorization (what can you do)

Construction needs **project-scoped** permissions (not only global roles).

| Tool | Model | Mode | Notes |
|------|-------|------|-------|
| **OpenFGA** | ReBAC (Zanzibar) | INTEGRATE | CNCF; great for `user:U can approve on project:P` |
| **SpiceDB** | Zanzibar | INTEGRATE | Authzed; production-grade |
| **Ory Keto** | Zanzibar-like | INTEGRATE | |
| **Casbin** | RBAC/ABAC/ReBAC | EMBED | Embed in API; many languages |
| **OPA** | Policy-as-code | INTEGRATE | Complex policies |
| **Oso** | Polar DSL | EMBED/cloud | Developer-friendly |
| **Permit.io** | Full stack | managed | |

**Recommendation:** Start **Casbin or simple Postgres ACLs** for MVP; migrate to **OpenFGA** when relations explode (company → portfolio → project → document).

---

## 3. Multi-tenancy patterns (REFERENCE, not libs)
- Row-level `org_id` on every table (simplest)  
- Schema-per-tenant (isolation, ops heavy)  
- Hybrid: shared app, isolated storage buckets per org  
- Feature flags: Unleash (OSS) · GrowthBook · Flagsmith  

---

## 4. Workflow / approval engines

### Visual builders (UI)
| Tool | Mode | Notes |
|------|------|-------|
| **xyflow / React Flow** | EMBED | **Best** node DAG editor for approval paths (Tornix “visual DAG”) |
| **Rete.js** | EMBED | Alternative node editor |
| **bpmn-js** (Camunda) | EMBED | Full BPMN diagrams if analysts need BPMN |

### Execution engines
| Tool | Mode | Best for |
|------|------|----------|
| **In-app state machine** | EMBED | MVP approvals (serial/parallel steps in Postgres) |
| **XState** | EMBED | Frontend+backend statecharts |
| **Temporal** | INTEGRATE | Long-running durable workflows, retries, AI agent loops — **MIT** |
| **Cadence** | INTEGRATE | Temporal predecessor |
| **Camunda 8 / Zeebe** | INTEGRATE | BPMN enterprise; licensing nuance on self-host |
| **Flowable / Activiti** | INTEGRATE | Java BPMN |
| **n8n** | INTEGRATE | Integration automations (fair-code) — not core approval SoR |
| **Activepieces** | INTEGRATE | MIT automation |
| **Apache Airflow** | INTEGRATE | Data/ETL — not human approvals |
| **Prefect** | INTEGRATE | Data workflows |
| **Inngest** | INTEGRATE | Event functions |
| **DBOS** | EMBED patterns | DB-native durable exec |
| **Imixs-Workflow** | INTEGRATE | Human-centric BPM |
| **ProcessMaker** | INTEGRATE | AGPL concerns |
| **Bonita** | INTEGRATE | BPM suite |

**Tornix alignment:**  
- UI: **React Flow** approval designer  
- Runtime MVP: Postgres workflow instances + job worker  
- Scale: **Temporal** for agent+approval durability  

---

## 5. Forms & dynamic schemas
| Tool | Mode |
|------|------|
| **JSON Forms** | EMBED |
| **React Hook Form + Zod** | EMBED |
| **Formio** | INTEGRATE/OSS |
| **SurveyJS** | PAID/OSS mix |
| **RJSF** (react-jsonschema-form) | EMBED |

Construction checklists/inspections = JSON schema forms + file fields.
