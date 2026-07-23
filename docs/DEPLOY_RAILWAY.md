# Deploy Rectangle on Railway

Rectangle is deployed as multiple services from one GitHub repo. This is the preferred production shape.

```text
Railway Project
├── Rectangle Web service  -> apps/web Dockerfile
├── Rectangle API service  -> apps/api Dockerfile
└── PostgreSQL             -> Railway managed database
```

Do not combine web, API, and database into one container.

## 1. Web service

Create a Railway service from GitHub repo `Ahmed-Sleem/rectangle`.

Settings:

```text
Root Directory: apps/web
Builder: Dockerfile
Dockerfile: Dockerfile
Healthcheck Path: /
Start Command: npm run start
```

Environment:

```text
PORT = Railway auto-provided
```

No secret is required for the current web app.

## 2. PostgreSQL

In the same Railway project:

```text
New -> Database -> PostgreSQL
```

Railway will provide `DATABASE_URL`.

## 3. API service

Create another Railway service from the same GitHub repo.

Settings:

```text
Root Directory: apps/api
Builder: Dockerfile
Dockerfile: Dockerfile
Healthcheck Path: /health/ready
Start Command: npm run migrate && npm run start
```

Environment:

```text
DATABASE_URL=<Railway Postgres DATABASE_URL>
SESSION_JWT_SECRET=<strong random secret, at least 32 chars>
CORS_ORIGIN=<your web service public URL>
NODE_ENV=production
PORT=Railway auto-provided
```

Generate `SESSION_JWT_SECRET` locally, for example:

```bash
openssl rand -base64 48
```

Never commit real secrets.

## 4. Smoke checks

After deploy:

```text
Web: https://<web-url>/
Web route: https://<web-url>/projects
API live: https://<api-url>/health/live
API ready: https://<api-url>/health/ready
```

Expected API responses:

```json
{"status":"ok"}
{"status":"ready"}
```

## 5. Current limitation

The API is real, but the web app is not wired to authenticated API workflows yet. Do not add demo data or fake frontend login. The next production slice is tenant/user bootstrap and then authenticated frontend integration.

## 6. Rollback

Railway UI -> Deployments -> select previous successful deployment -> Redeploy.

Or revert the Git commit on `main` and push.
