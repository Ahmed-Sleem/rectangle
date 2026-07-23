# Rectangle Docker Deployment

Rectangle uses separate production containers for each deployable service. This keeps the product organized for hosted deployments now and company/private deployments later.

## Service layout

```text
web       apps/web/Dockerfile      React/Vite static app served by Node `serve`
api       apps/api/Dockerfile      Fastify API
postgres  managed database or Compose Postgres
migrate   API image running `npm run migrate`
```

Do not run web, API, and database inside one container for production.

## Local company-style deployment

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Edit `.env` and set strong values:

```text
POSTGRES_PASSWORD=...
SESSION_JWT_SECRET=...
```

3. Start the stack:

```bash
docker compose up --build
```

4. Check:

```text
Web: http://localhost:3000
API: http://localhost:8080/health/ready
```

## Production principles

- Real secrets belong in the deployment platform or private `.env`, never Git.
- PostgreSQL is internal-only in Compose.
- The migration service runs before API startup.
- API readiness checks database connectivity.
- Each app container runs as a non-root user.
- Docker images are multi-stage builds.

## Railway production mapping

On Railway, use separate services from the same GitHub repo:

```text
Rectangle Web  -> root apps/web, Dockerfile apps/web/Dockerfile
Rectangle API  -> root apps/api, Dockerfile apps/api/Dockerfile
PostgreSQL     -> Railway managed Postgres
```

Set API variables in Railway:

```text
DATABASE_URL=<Railway Postgres DATABASE_URL>
SESSION_JWT_SECRET=<strong random secret>
CORS_ORIGIN=<web public URL>
NODE_ENV=production
```

The web service currently has no required secrets. Future API integration will add a public API base URL at build time.
