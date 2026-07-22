# Documents, PDF Drawings, Markup, BIM

## 1. PDF viewing & annotation (2D drawings — MVP critical)

### Mozilla PDF.js
| | |
|--|--|
| **npm** | `pdfjs-dist` |
| **Mode** | EMBED |
| **License** | Apache-2.0 |
| **Notes** | Base renderer. **AnnotationEditorLayer** (v3+/4+): free text, ink, stamp, highlight; `saveDocument()` bakes annotations. Build custom toolbar. |

### react-pdf (wojtekmaj)
| | |
|--|--|
| **npm** | `react-pdf` |
| **Mode** | EMBED |
| **Notes** | React wrappers around PDF.js for page display — not full Bluebeam |

### react-pdf-highlighter / extended / plus
| Packages | Notes |
|----------|-------|
| `react-pdf-highlighter` (original) | Text + rect highlights; viewport-independent coords (server-friendly) |
| `react-pdf-highlighter-extended` | https://github.com/DanielArnould/react-pdf-highlighter-extended — zoom, contexts, fixes |
| `react-pdf-highlighter-plus` | Highlights, freehand, signatures, shapes, export (newer 2025–26) |

**Mode:** EMBED — ideal for **pins/markups on sheets** if you store annotation JSON + page + %coords.

### pdf-lib
| | |
|--|--|
| **npm** | `pdf-lib` |
| **Mode** | EMBED |
| **Notes** | Create/modify PDFs server or browser (stamps, merge) |

### Commercial PDF SDKs (bake-off only)
Nutrient/PSPDFKit, PDF.js Express, Syncfusion, Apryse — annotations+forms+sign faster, $$  

### Stimulus PDF viewer
https://github.com/jhubert/stimulus-pdf-viewer — Rails/Stimulus annotations REFERENCE

**Construction drawing UX recipe:**
1. PDF.js render sheet  
2. Overlay SVG/canvas layer for pins (RFI, punch, photo)  
3. Store `{doc_rev_id, page, x_pct, y_pct, type, payload}`  
4. Version set = ordered revisions; “current” flag  
5. Optional tile pyramid later for huge scans (OpenSeadragon)

### OpenSeadragon
| | |
|--|--|
| **URL** | https://openseadragon.github.io |
| **Mode** | EMBED |
| **Notes** | Deep zoom for large plan images |

---

## 2. Office docs / wiki

| Tool | Mode | Notes |
|------|------|-------|
| **TipTap** (ProseMirror) | EMBED | Modern editor; collab via Yjs |
| **Plate** / **Lexical** | EMBED | Alternative rich text |
| **OnlyOffice** | INTEGRATE | Full office suite self-host |
| **Collabora Online** | INTEGRATE | LibreOffice online |
| **Outline** | INTEGRATE | Team wiki |
| **AppFlowy** | REFERENCE | Docs |

---

## 3. BIM / IFC (phase later — don’t block MVP)

### That Open Company (ex IFC.js)
| Package | URL | Notes |
|---------|-----|-------|
| **web-ifc** | https://github.com/ThatOpen/engine_web-ifc | Fast IFC read/write WASM |
| **web-ifc-viewer** | https://github.com/ThatOpen/web-ifc-viewer | THREE.js tools, planes, plans |
| **@thatopen/components** | npm ecosystem | Building blocks for open BIM apps |

**License:** Check each package (historically MIT/MPL-class — verify).

### xeokit (Creoox)
| | |
|--|--|
| **SDK** | https://github.com/xeokit/xeokit-sdk |
| **Viewer package** | https://github.com/xeokit/xeokit-bim-viewer |
| **Mode** | EMBED — dual license: open + commercial options for closed apps |
| **Notes** | High-perf WebGL, double precision, XKT format, BCF viewpoints, section planes |
| **Legal** | Confirm AGPL/dual terms for SaaS before ship |

### BIMsurfer
https://github.com/opensourceBIM/BIMsurfer — BIMServer-oriented; older stacks

### IfcOpenShell
https://ifcopenshell.org — Python/C++ conversion pipeline server-side

**Recommendation:** MVP = PDF sheets only. Phase BIM: convert IFC→XKT or use web-ifc; link issues to `global_id`.

---

## 4. CAD / DWG
Native DWG viewers are mostly commercial (Autodesk, Cadex, etc.). OSS reality:
- Convert to PDF/PNG/SVG server-side (ODA commercial, or LibreCAD limited)
- Prefer **PDF deliverables** from consultants as system of record for field

---

## 5. File pipeline infra

| Component | Tool |
|-----------|------|
| Object storage | MinIO (S3) · SeaweedFS |
| Image processing | Sharp · Pillow · libvips |
| Virus scan | ClamAV |
| Thumbnails | pdf2image · poppler |
| MIME/sniff | file-type · python-magic |
