/**
 * Rectangle API entrypoint composes production infrastructure adapters and
 * starts the HTTP server only after required configuration is validated.
 */
import { AdminService } from "./application/admin-service.js";
import { AuthService } from "./application/auth-service.js";
import { ProjectService } from "./application/project-service.js";
import { SetupService } from "./application/setup-service.js";
import { loadConfig } from "./config.js";
import { createServer } from "./http/server.js";
import { ScryptPasswordHasher } from "./infrastructure/password.js";
import { PostgresAdminRepository } from "./infrastructure/postgres/admin-repository.js";
import { PostgresAuditRepository } from "./infrastructure/postgres/audit-repository.js";
import { PostgresAuthRepository } from "./infrastructure/postgres/auth-repository.js";
import { assertDatabaseReady, createPostgresPool } from "./infrastructure/postgres/pool.js";
import { PostgresProjectsRepository } from "./infrastructure/postgres/projects-repository.js";
import { PostgresSetupRepository } from "./infrastructure/postgres/setup-repository.js";

const config = loadConfig();
const pool = createPostgresPool(config.DATABASE_URL);
const auditRepository = new PostgresAuditRepository(pool);
const projectService = new ProjectService(
  new PostgresProjectsRepository(pool),
  auditRepository,
);
const passwordHasher = new ScryptPasswordHasher();
const authService = new AuthService(
  new PostgresAuthRepository(pool),
  passwordHasher,
  auditRepository,
  config.SESSION_JWT_SECRET,
);
const adminService = new AdminService(
  new PostgresAdminRepository(pool),
  passwordHasher,
  auditRepository,
);
const setupService = new SetupService(
  new PostgresSetupRepository(pool),
  passwordHasher,
  auditRepository,
  config.SESSION_JWT_SECRET,
);

const server = await createServer({
  projectService,
  authService,
  adminService,
  setupService,
  jwtSecret: config.SESSION_JWT_SECRET,
  ...(config.CORS_ORIGIN ? { corsOrigin: config.CORS_ORIGIN } : {}),
  ...(process.env.RECTANGLE_WEB_DIST ? { webDistPath: process.env.RECTANGLE_WEB_DIST } : {}),
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
