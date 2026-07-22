# GUI / UX Patterns Synthesis

## 1. Shell patterns

### A. Project-tool matrix (Procore, ACC)
```
[Portfolio Home] → [Project Switcher] → left/top TOOL NAV (RFI, Drawings, Budget…)
```
- **Pros:** Clear mental model for construction tools  
- **Cons:** 20+ tools = maze; needs role-based tool sets  

### B. Hierarchical work OS (Plane, ClickUp, Jira)
```
Workspace → Project → Cycles/Modules → Work items
Views: List | Board | Gantt | Calendar | Table
```
- **Pros:** Flexible; great for mixed teams  
- **Cons:** Weak native “drawing” object  

### C. ERP desk (ERPNext, Odoo)
```
Awesomebar search → DocType list → Form → Linked documents
```
- **Pros:** Infinite modularity  
- **Cons:** Not field-first  

### D. Scheduler cockpit (P6)
```
Activity table | Gantt | Resource histograms | filters/codes
```
- **Pros:** Power  
- **Cons:** Specialist-only  

**Tornix-like recommendation:** Hybrid **A+B** — project tool matrix for construction objects + multi-view work items; separate **Scheduler cockpit** route for planners; **My day** home like Tornix “تركيز اليوم”.

---

## 2. Home / dashboard patterns

| Pattern | Who | Content |
|---------|-----|---------|
| Today’s focus | Tornix | Risks, due tasks, AI actions |
| Action required inbox | Procore | Approvals, RFIs assigned |
| My Page widgets | OpenProject | Configurable widgets |
| Executive portfolio | Planview/PMO | Health, $ , traffic lights |
| Capture progress | Buildots | % built vs plan by location |

**Must-have widgets:** My approvals · Due this week · Risk heat · AI recommendations · Project health · Cash/CPI SPI (role-gated)

---

## 3. Field UX canon

1. **Open latest drawing set** (auto current rev)  
2. **Pin** issue/RFI/punch/photo to x,y (+level)  
3. **Offline queue** with clear sync state  
4. **Big tap targets**, glove-friendly  
5. **Voice** notes + voice AI  
6. **Daily log** wizard < 2 minutes  
7. **WhatsApp share** deep links (MENA)  

---

## 4. AI UX canon (2026)

| Pattern | Example | Trust mechanic |
|---------|---------|----------------|
| Side chat grounded in project | Assist, Plane AI, Tornix | Citations to RFI# / doc rev |
| Agent as teammate | Planner PM agent, Helix agents | Appears in assignee lists |
| Synopsis → supervisor | Bernards/Procore quote | Human approve |
| Agent builder | Helix | NL → workflow |
| Daily brief card | Tornix mobile | Push morning |
| Photo intelligence | Helix, Buildots | Visual evidence |
| Multi-agent handoff | Helix story | Show chain of thought lightly |

**Anti-patterns:** Black-box autonomy on financial approvals; AI without source links; English-only AI in AR UI.

---

## 5. Density & progressive disclosure

- **Asana rule:** default calm; power in empty states  
- **ClickUp warning:** feature vomit kills adoption  
- **P6 rule:** separate “planner mode”  
- **Role skins:** Owner vs PM vs Site engineer vs Accountant vs Executive  

---

## 6. Visual language trends
- Dark mode (field night shifts)  
- Traffic-light health  
- Gantt critical path in red  
- 5×5 risk matrix heat  
- KPI sparklines  
- Card-based AI recommendations with severity chips (Tornix)  
- Crystal/glass marketing (Tornix) vs industrial orange (Procore) vs Autodesk blue-grey  

---

## 7. Navigation IA checklist for our product

```
Home (Today)
Portfolio
Projects
  ├─ Overview
  ├─ Schedule (Gantt/CPM)
  ├─ Tasks
  ├─ Drawings
  ├─ RFIs / Submittals (phase these)
  ├─ Risks
  ├─ Costs / EVM
  ├─ Documents
  ├─ Approvals
  ├─ Team
  └─ AI
PMO / Strategy
Procurement (later)
Chat
Meetings
Admin
```

Use **feature flags per tenant** so SMB doesn’t see Unifier-level cost codes day one.
