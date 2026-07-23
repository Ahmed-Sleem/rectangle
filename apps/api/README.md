# Rectangle API

Production API service for Rectangle. The first implemented domain slice is tenant-scoped Projects with strict validation, bearer-token authentication, object-level tenant filtering, PostgreSQL persistence, and audit events.

## Stack

- Fastify + TypeScript
- Zod validation at API/service boundaries
- PostgreSQL via `pg`
- JWT bearer auth boundary via `jose`
- Vitest tests

## Required environment

```bash
DATABASE_URL=postgres://user:password@host:5432/rectangle
SESSION_JWT_SECRET=<at least 32 characters>
CORS_ORIGIN=http://localhost:5173
PORT=8080
```

No default users, demo tenants, or fake login are provided. Tokens must be issued by the configured auth layer and include these claims:

```json
{
  "sub": "user uuid",
  "tenant_id": "tenant uuid",
  "roles": ["tenant_admin"]
}
```

## Local commands

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run verify
npm run migrate
npm run dev
```

## Routes

- `GET /health/live`
- `GET /health/ready`
- `GET /v1/projects`
- `POST /v1/projects`
- `GET /v1/projects/:projectId`
- `PATCH /v1/projects/:projectId`

All `/v1/*` routes require a valid bearer token. Project mutations emit audit events.
