# Search, Files, Analytics, Data Stack

## 1. Primary database & ORM

| Component | Options |
|-----------|---------|
| DB | **PostgreSQL 16+** (required) |
| ORM (TS) | Drizzle · Prisma · Kysely |
| ORM (Py) | SQLAlchemy 2 · Tortoise · Prisma Py |
| Migrations | Alembic · drizzle-kit · goose |
| Jobs | **ARQ** · Celery · BullMQ · GoodJob pattern · Temporal |
| Cache | Redis · KeyDB · Valkey |
| Queue | Redis · RabbitMQ · NATS · SQS |

---

## 2. Search

| Engine | Mode | Notes |
|--------|------|-------|
| **Meilisearch** | INTEGRATE | DX best; **test Arabic** tokenization |
| **Typesense** | INTEGRATE | Typo-tolerant |
| **OpenSearch** | INTEGRATE | Heavy, powerful |
| **Elasticsearch** | INTEGRATE | Same family |
| **Postgres FTS** | EMBED | MVP good enough |
| **ZincSearch** | INTEGRATE | Lightweight ES-like |
| **Sonic** | INTEGRATE | Simple |

**Arabic:** verify diacritics, root search expectations; may need custom analyzer or Elasticsearch Arabic plugin.

---

## 3. Object storage & CDN
| Tool | Mode |
|------|------|
| **MinIO** | INTEGRATE S3-compatible self-host |
| **SeaweedFS** | INTEGRATE |
| **Garage** | INTEGRATE |
| AWS S3 / R2 / GCS | managed |
| **Imgproxy** / thumbor | image resize |
| **ClamAV** | virus scan uploads |

---

## 4. Analytics & dashboards
| Tool | Mode | Notes |
|------|------|-------|
| **Apache ECharts** | EMBED | Rich charts, gauge, heatmap |
| **Recharts** | EMBED | React simple |
| **Visx** / **Nivo** | EMBED | |
| **Observable Plot** | EMBED | |
| **Metabase** | INTEGRATE | End-user BI |
| **Grafana** | INTEGRATE | Ops + some business |
| **Cube** | INTEGRATE | Metrics layer |
| **Apache Superset** | INTEGRATE | |
| **Evidence** | INTEGRATE | SQL→docs |
| **Lightdash** | INTEGRATE | |

Portfolio heatmaps = ECharts + materialized views of project health.

---

## 5. Kanban / boards UI
| Tool | Mode |
|------|------|
| **@dnd-kit** | EMBED — modern accessible DnD |
| **pragmatic-drag-and-drop** (Atlassian) | EMBED |
| react-beautiful-dnd | ⚠️ maintenance legacy |
| shadcn kanban examples | REFERENCE https://github.com/Georgegriff/react-dnd-kit-tailwind-shadcn-ui |

---

## 6. Whiteboards / markups freeform
| Tool | Mode |
|------|------|
| **tldraw** | EMBED — excellent canvas (license check current) |
| **Excalidraw** | EMBED/INTEGRATE |
| fabric.js | EMBED | canvas drawings on sheets |

---

## 7. Reporting / PDF generation
| Tool | Mode |
|------|------|
| **react-pdf/renderer** | EMBED | status reports |
| **Puppeteer** / Playwright print | INTEGRATE | HTML→PDF |
| **WeasyPrint** | EMBED Py |
| **Gotenberg** | INTEGRATE | LibreOffice/Chromium convert API |
| **Carbone** | INTEGRATE | template reports |
| **docx-templates** / docxtemplater | EMBED | Word |

---

## 8. Observability (product infra)
| Tool | Mode |
|------|------|
| OpenTelemetry | EMBED |
| Grafana stack / Prometheus | INTEGRATE |
| Sentry (self-host GlitchTip) | INTEGRATE |
| PostHog | INTEGRATE product analytics OSS option |
