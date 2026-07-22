# Cost, BOQ, Excel/CSV, Risk Quantitative

## 1. Spreadsheet / BOQ parsing

| Library | Lang | Mode | Notes |
|---------|------|------|-------|
| **openpyxl** | Py | EMBED | xlsx read/write |
| **xlrd/xlwt** | Py | legacy xls |
| **pandas** | Py | EMBED | tabular clean |
| **SheetJS (xlsx)** | JS | EMBED/community vs pro | Browser parse BOQ uploads |
| **ExcelJS** | JS | EMBED | |
| **python-calamine** | Py | fast read |
| **csv-parse** / papaparse | JS | EMBED | |

**BOQ model (internal):**
```
boq_line: { code, description_ar, description_en, unit, qty, rate, amount, wbs_id? }
```
AI assist: LLM maps freeform Excel columns → schema (with human confirm).

**Sister product Costra (Ailigent)** is commercial estimating — integrate later, don’t rebuild takeoff CV (Togal-class) in v1.

---

## 2. EVM / cost engine
Implement in domain service (no special OSS required):

```
PV, EV, AC
CPI = EV/AC
SPI = EV/PV
EAC = BAC/CPI  (or other formulas)
ETC, VAC, TCPI
```

Reference implementations: OpenProject budget modules (GPL REFERENCE only), PMI practice standard, public spreadsheets.

**Currency:** money library  
- Py: `babel` · `moneyed`  
- TS: `dinero.js` · `currency.js`  

MENA: SAR, EGP, AED, USD multi-currency + rate table.

---

## 3. Monte Carlo & schedule risk

| Approach | Tools |
|----------|-------|
| Custom | numpy.random → pyCritical reschedule → histogram |
| Excel analyst | XLRisk addin OSS REFERENCE |
| SimPy | discrete event if needed |
| @risk commercial | not OSS |

Store run results: p50/p80/p90 finish dates per project.

---

## 4. Estimating / takeoff (later)
| OSS-ish | Notes |
|---------|-------|
| Limited true OSS takeoff | Market is commercial (Togal, Bluebeam) |
| PDF measure | custom scale calibration on pdf.js canvas |
| Ifc quantity takeoff | IfcOpenShell scripts |

---

## 5. Accounting integration connectors
| Target | Approach |
|--------|----------|
| QuickBooks | Official API |
| Xero | API |
| Odoo/ERPNext | REST |
| SAP | BAPI/OData — partner |
| n8n | glue for SMB ERPs |

---

## 6. Units & construction codes
| Need | Resource |
|------|----------|
| Unit conversion | pint (Py) · convert-units (JS) |
| CSI MasterFormat | licensed data — don’t scrape illegally; allow custom code structures |
| OmniClass | same |
| Local Saudi codes | customer-provided taxonomies |
