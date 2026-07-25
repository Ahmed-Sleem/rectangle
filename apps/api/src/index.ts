/**
 * Rectangle API entrypoint composes production infrastructure adapters and
 * starts the HTTP server only after required configuration is validated.
 */
import { AdminService } from "./application/admin-service.js";
import { EmailSettingsService } from "./application/email-settings-service.js";
import { AuthService } from "./application/auth-service.js";
import { PasskeyService } from "./application/passkey-service.js";
import { OverviewService } from "./application/overview-service.js";
import { ProjectService } from "./application/project-service.js";
import { ProjectTeamService } from "./application/project-team-service.js";
import { SetupService } from "./application/setup-service.js";
import { loadConfig } from "./config.js";
import { createServer } from "./http/server.js";
import { NodemailerEmailSender } from "./infrastructure/email-sender.js";
import { ScryptPasswordHasher } from "./infrastructure/password.js";
import { PostgresAdminRepository } from "./infrastructure/postgres/admin-repository.js";
import { PostgresAuditRepository } from "./infrastructure/postgres/audit-repository.js";
import { PostgresAuthRepository } from "./infrastructure/postgres/auth-repository.js";
import { assertDatabaseReady, createPostgresPool } from "./infrastructure/postgres/pool.js";
import { PostgresEmailSettingsRepository } from "./infrastructure/postgres/email-settings-repository.js";
import { PostgresPasskeyRepository } from "./infrastructure/postgres/passkey-repository.js";
import { PostgresOverviewRepository } from "./infrastructure/postgres/overview-repository.js";
import { PostgresProjectsRepository } from "./infrastructure/postgres/projects-repository.js";
import { PostgresProjectTeamRepository } from "./infrastructure/postgres/project-team-repository.js";
import { PostgresSetupRepository } from "./infrastructure/postgres/setup-repository.js";

const config = loadConfig();
const pool = createPostgresPool(config.DATABASE_URL);
const auditRepository = new PostgresAuditRepository(pool);
const projectsRepository = new PostgresProjectsRepository(pool);
const overviewService = new OverviewService(new PostgresOverviewRepository(pool));
const projectService = new ProjectService(
  projectsRepository,
  auditRepository,
);
const projectTeamService = new ProjectTeamService(
  projectsRepository,
  new PostgresProjectTeamRepository(pool),
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
const emailSettingsService = new EmailSettingsService(
  new PostgresEmailSettingsRepository(pool),
  new NodemailerEmailSender(),
  auditRepository,
);
const passkeyService = new PasskeyService(
  new PostgresPasskeyRepository(pool),
  auditRepository,
  config.SESSION_JWT_SECRET,
);

const server = await createServer({
  overviewService,
  projectService,
  projectTeamService,
  authService,
  adminService,
  setupService,
  emailSettingsService,
  passkeyService,
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
