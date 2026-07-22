# Mobile, Offline-First, i18n & RTL

## 1. Mobile app frameworks

| Stack | Mode | Notes |
|-------|------|-------|
| **Flutter** | greenfield | Strong RTL, one codebase; good for field |
| **React Native + Expo** | greenfield | Shares TS with web |
| **Capacitor** | wrap web | Fastest if web-first PWA |
| **.NET MAUI** | — | If C# shop |

Tornix ships native iOS/Android — either Flutter or RN is fine; **RTL testing is the real work**.

---

## 2. Offline sync engines

| Tool | License | Mode | Notes |
|------|---------|------|-------|
| **WatermelonDB** | MIT | EMBED | RN SQLite; you implement sync protocol |
| **RxDB** | Apache/OSS + premium plugins | EMBED | Reactive; many backends |
| **PowerSync** | Source-available | INTEGRATE | Postgres→SQLite; less DIY |
| **ElectricSQL** | Apache-2.0 | INTEGRATE | Postgres sync + TanStack DB |
| **PGlite** | Apache | EMBED | Postgres-in-WASM local |
| **Dexie.js** | Apache | EMBED | IndexedDB wrapper (PWA) |
| **PouchDB** | Apache | EMBED | Older Couch sync |
| **SQLite** / **sql.js** / **drizzle-orm + expo-sqlite** | — | EMBED | |
| **Replicache** | proprietary model | — | Check current license |
| **Legend-State** | — | EMBED | Local-first state + Supabase examples |
| **Jazz** | — | EMBED | CRDT local-first |
| **Automerge/Yjs** | — | collab offline docs | |

**Field recommendation:**
- **RN:** WatermelonDB or PowerSync  
- **Flutter:** drift/sqlite + custom sync or PowerSync Flutter  
- **Conflict policy:** server wins on cost/baseline; LWW on task comments; explicit merge on drawings pins  

**Offline must-queue:** task status, daily log drafts, photos (upload later), punch items.

---

## 3. Media capture field
| Need | Lib |
|------|-----|
| Camera | expo-camera · image_picker |
| Background upload | uppy companions · tus protocol (**tusd**) |
| Compression | flutter_image_compress · browser-image-compression |
| EXIF GPS | exifr · native |

**tus** resumable uploads: https://tus.io — critical for site photos on bad networks.

---

## 4. i18n & Arabic RTL

| Layer | Tool |
|-------|------|
| Web i18n | **i18next** · **FormatJS** · **lingui** |
| ICU messages | formatjs/intl |
| RN | i18next · flutter_localizations + intl |
| RTL CSS | logical properties (`margin-inline-start`) · Tailwind `rtl:` |
| Detect | `rtl-detect` · bidi-js |
| Dates | **Temporal** · dayjs + locales · **date-fns** · moment-hijri if needed |
| Numbers | Intl.NumberFormat ar-EG / ar-SA |
| Fonts | **Cairo**, **Noto Naskh Arabic**, **IBM Plex Sans Arabic** |
| Bidirectional text | Avoid string concat; use isolated bidi embeds |

**QA checklist:**  
- Sidebar mirrors  
- Gantt headers  
- PDF overlay coords independent of RTL  
- AI answers in AR with correct numerals  
- Mixed AR/EN project names  

---

## 5. PWA
| Tool | Notes |
|------|-------|
| Workbox | service workers |
| vite-plugin-pwa | |
| Background sync API | limited Safari |

PWA complements but does **not** replace native offline for heavy field.
