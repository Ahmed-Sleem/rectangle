/**
 * Rectangle API entrypoint composes production infrastructure adapters and
 * starts the HTTP server only after required configuration is validated.
 */
import { AuthService } from "./application/auth-service.js";
import { ProjectService } from "./application/project-service.js";
import { loadConfig } from "./config.js";
import { createServer } from "./http/server.js";
import { ScryptPasswordHasher } from "./infrastructure/password.js";
import { PostgresAuditRepository } from "./infrastructure/postgres/audit-repository.js";
import { PostgresAuthRepository } from "./infrastructure/postgres/auth-repository.js";
import { assertDatabaseReady, createPostgresPool } from "./infrastructure/postgres/pool.js";
import { PostgresProjectsRepository } from "./infrastructure/postgres/projects-repository.js";

const config = loadConfig();
const pool = createPostgresPool(config.DATABASE_URL);
const auditRepository = new PostgresAuditRepository(pool);
const projectService = new ProjectService(
  new PostgresProjectsRepository(pool),
  auditRepository,
);
const authService = new AuthService(
  new PostgresAuthRepository(pool),
  new ScryptPasswordHasher(),
  auditRepository,
  config.SESSION_JWT_SECRET,
);

const server = await createServer({
  projectService,
  authService,
  jwtSecret: config.SESSION_JWT_SECRET,
  corsOrigin: config.CORS_ORIGIN,
  readinessCheck: () => assertDatabaseReady(pool),
});

const shutdown = async () => {
  await server.close();
  await pool.end();
};

process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});
process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});

await server.listen({ port: config.PORT, host: "0.0.0.0" });
