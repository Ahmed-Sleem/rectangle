# Scheduling — Gantt UI, CPM Engines, P6/MSP Interop

## 1. Gantt chart libraries (frontend)

### A. dhtmlx-gantt (Community)
| | |
|--|--|
| **npm** | `dhtmlx-gantt` |
| **GitHub** | https://github.com/DHTMLX/gantt |
| **License** | **MIT** (Community) |
| **Mode** | EMBED / PAID-OSS |
| **CE includes** | Grid+timeline, FS/SS/FF/SF + lag, drag, milestones, 32 locales, export helpers, smart rendering |
| **PRO only** | **Auto-scheduling, critical path & slack, resources, baselines, constraints, work calendars, WBS, undo** |
| **Frameworks** | Vanilla + React/Vue/Angular wrappers |
| **Verdict** | Best-known enterprise Gantt; budget for PRO if you need real CPM in-browser **or** compute CPM server-side and only paint CE |

### B. SVAR Gantt (ex wx-react-gantt)
| | |
|--|--|
| **npm** | `@svar-ui/react-gantt` / svelte |
| **Site** | https://svar.dev/react/gantt/ |
| **License** | **MIT** core (v2.4+) |
| **PRO** | Critical path, baselines, resources, calendars, auto-schedule |
| **Mode** | EMBED / PAID-OSS |
| **Verdict** | Modern React DX; MCP server for AI-assisted integration; good 2026 option |

### C. frappe-gantt
| | |
|--|--|
| **GitHub** | https://github.com/frappe/gantt |
| **License** | MIT |
| **Mode** | EMBED |
| **Verdict** | Lightweight timelines only — **not** enterprise CPM. Fine for simple views/MVP mock |

### D. gantt-task-react (MaTeMaTuK)
| | |
|--|--|
| **GitHub** | https://github.com/MaTeMaTuK/gantt-task-react |
| **License** | MIT |
| **Mode** | EMBED / fork |
| **Verdict** | Simple React TS Gantt; customize heavily; no full CPM |

### E. Bryntum Gantt
| | |
|--|--|
| **Site** | https://bryntum.com/products/gantt/ |
| **License** | **Commercial** |
| **Mode** | COMMERCIAL bake-off |
| **Verdict** | Deepest desktop-class scheduling in browser; MSP/P6 import themes; expensive but fastest path to P6-like UX |

### F. Syncfusion Gantt
| | |
|--|--|
| **License** | Community license possible for small cos; else commercial |
| **Mode** | PAID-OSS/COMMERCIAL |
| **Verdict** | Full feature set; evaluate community eligibility |

### G. amCharts Gantt
| | |
|--|--|
| **Mode** | PAID for commercial in many cases |
| **Verdict** | Visualization-first |

**Recommendation:**  
- **MVP:** SVAR MIT or dhtmlx CE for UI + **server CPM**.  
- **Scale:** Buy dhtmlx/SVAR PRO **or** Bryntum if schedule is the product.  
- Never rely on CE alone for “critical path” marketing claims.

---

## 2. CPM / PERT engines (backend)

| Library | URL | Notes |
|---------|-----|-------|
| **pyCritical** | https://github.com/Valdecy/pyCritical | CPM + PERT, Gantt viz, web app helper — **strong Python pick** |
| **Critical-Path-Method** | https://github.com/alfonsodipace/Critical-Path-Method | Simple educational CPM |
| **PERTgen** | https://github.com/vamsi-aribandi/PERTgen | NetworkX + matplotlib |
| **NetworkX** | https://networkx.org | Build own DAG longest-path CPM |
| **graphlib** (stdlib) | Python 3 | Topo sort building block |
| Custom TS | — | Port ES/EF/LS/LF float math; unit-test against golden schedules |

**EVM math:** Implement yourself (PV, EV, AC, CPI, SPI, EAC, VAC) — formulas are standard PMI; no heavy lib required. OpenProject source is REFERENCE for reports.

**Monte Carlo schedule risk:**  
- `numpy` / `scipy` sampling on activity durations  
- XLRisk (Excel addin OSS) for analyst REFERENCE only  
- Own service: sample durations → reschedule CPM → distribution of finish dates

---

## 3. P6 / MS Project interchange

### MPXJ (primary recommendation)
| | |
|--|--|
| **Site** | https://www.mpxj.org |
| **GitHub** | https://github.com/joniles/mpxj |
| **Lang** | Java core; **.NET**, **Python**, Ruby wrappers |
| **Reads** | MPP, MPX, MSPDI, **P6 XER**, PMXML, Planner, many others; P6 EPPM/OPC services |
| **Writes** | MPX, MSPDI, PMXML, **XER**, Planner, SDEF… |
| **Mode** | EMBED (sidecar JVM or Python package) |
| **Verdict** | **Industry default** for serious interop |

### PyP6Xer
| | |
|--|--|
| **GitHub** | https://github.com/HassanEmam/PyP6Xer |
| **Mode** | EMBED pure Python |
| **Notes** | Parse/analyze/write XER; activities, resources, calendars, relationships; zero heavy deps claimed |
| **Verdict** | Great if stack is Python-only and XER-focused |

### xer-reader
| | |
|--|--|
| **GitHub** | https://github.com/jjCode01/xer-reader · PyPI `xer-reader` |
| **Mode** | EMBED |
| **Notes** | Table-level XER parse; tested P6 15.2–19.12 exports |

### PrimeveraXEREditor
| | |
|--|--|
| **GitHub** | https://github.com/ASHspace/PrimeveraXEREditor |
| **Mode** | REFERENCE (Java + MPXJ) |

### Aspose.Tasks Cloud
| | |
|--|--|
| **Mode** | COMMERCIAL SaaS SDK |
| **Notes** | MPP/XER conversions if you accept vendor lock |

### Online viewers (not embed core)
- ppmcore Universal Project Viewer — XER/MPP in browser (SaaS)

**Recommendation:**  
Import pipeline: upload XER/MPP → **MPXJ or PyP6Xer** → normalize to internal Activity model → CPM validate → Gantt UI.  
Export: internal → XER/MSPDI for planners still living in P6.

---

## 4. Working calendars & constraints
Few MIT libs do full P6-style calendars. Plan to implement:
- Project + resource calendars (work weeks, exceptions)
- Constraints: SNET, SNLT, MSO, MFO… (subset for MVP)
- Lag/lead on FS/SS/FF/SF

Steal test vectors from MPXJ sample files and OpenProject scheduling specs.
