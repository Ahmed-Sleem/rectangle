# Deploy Rectangle on Railway

Recommended Railway setup now: **one app service + one PostgreSQL database**.

```text
Railway Project
├── Rectangle App   -> root Dockerfile; API serves web + /v1 API
└── PostgreSQL      -> Railway managed database
```

The source remains organized separately:

```text
apps/web  -> React/Vite frontend
apps/api  -> Fastify API/backend
```

The root Dockerfile builds both and runs the API. The API serves the built web app from the same domain.

## 1. PostgreSQL

In Railway:

```text
New -> Database -> PostgreSQL
```

## 2. Rectangle App service

Use the existing GitHub repo service or create one from:

```text
Ahmed-Sleem/rectangle
```

Settings:

```text
Root Directory: empty / repo root
Builder: Dockerfile
Dockerfile Path: Dockerfile
Start Command: npm run start
Healthcheck Path: /health/live
Healthcheck Timeout: 300
```

## 3. Variables on the Rectangle App service

Required:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
SESSION_JWT_SECRET=<strong random secret, at least 32 chars>
NODE_ENV=production
```

Optional for same-service deployment:

```text
CORS_ORIGIN=<leave empty unless web and API are split again>
```

Generate a secret locally:

```bash
openssl rand -base64 48
```

Never commit or share real secrets.

## 4. Smoke checks

After deploy, open:

```text
https://<app-url>/
https://<app-url>/projects
https://<app-url>/health/live
https://<app-url>/health/ready
```

Expected API health:

```json
{"status":"ok"}
{"status":"ready"}
```

## 5. If deployment fails

Check the app deployment logs for the first real error above the healthcheck failure. Common causes:

- `DATABASE_URL` not attached to the app service.
- `SESSION_JWT_SECRET` shorter than 32 characters.
- App service still has old root directory `apps/api` instead of repo root.
- App service still uses the old API-only Dockerfile instead of root Dockerfile.

## 6. Future split

Because code remains separated in `apps/web` and `apps/api`, we can split back into separate Railway services later without rewriting the app.
