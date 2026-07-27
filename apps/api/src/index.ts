/**
 * Rectangle API entrypoint composes production infrastructure adapters and
 * starts the HTTP server only after required configuration is validated.
 */
import { AdminService } from "./application/admin-service.js";
import { EmailSettingsService } from "./application/email-settings-service.js";
import { AuthService } from "./application/auth-service.js";
import { PasskeyService } from "./application/passkey-service.js";
import { ActivityService } from "./application/activity-service.js";
import { RetentionService } from "./application/retention-service.js";
import { OverviewService } from "./application/overview-service.js";
import { AuthLifecycleService } from "./application/auth-lifecycle-service.js";
import { SmtpNotificationSender } from "./application/notification-sender.js";
import { ProfileService } from "./application/profile-service.js";
import { ProjectService } from "./application/project-service.js";
import { ProjectTeamService } from "./application/project-team-service.js";
import { RiskService } from "./application/risk-service.js";
import { SearchService } from "./application/search-service.js";
import { SetupService } from "./application/setup-service.js";
import { TaskService } from "./application/task-service.js";
import { loadConfig, resolveAppBaseUrl } from "./config.js";
import { createServer } from "./http/server.js";
import { NodemailerEmailSender } from "./infrastructure/email-sender.js";
import { ScryptPasswordHasher } from "./infrastructure/password.js";
import { InMemoryLoginThrottle } from "./domain/login-throttle.js";
import { PostgresAdminRepository } from "./infrastructure/postgres/admin-repository.js";
import { PostgresAuditRepository } from "./infrastructure/postgres/audit-repository.js";
import { PostgresAuthRepository } from "./infrastructure/postgres/auth-repository.js";
import { assertDatabaseReady, createPostgresPool } from "./infrastructure/postgres/pool.js";
import { PostgresEmailSettingsRepository } from "./infrastructure/postgres/email-settings-repository.js";
import { PostgresPasskeyRepository } from "./infrastructure/postgres/passkey-repository.js";
import { PostgresActivityRepository } from "./infrastructure/postgres/activity-repository.js";
import { PostgresOverviewRepository } from "./infrastructure/postgres/overview-repository.js";
import { PostgresAuthTokenRepository } from "./infrastructure/postgres/auth-token-repository.js";
import { PostgresProfileRepository } from "./infrastructure/postgres/profile-repository.js";
import { PostgresProjectsRepository } from "./infrastructure/postgres/projects-repository.js";
import { PostgresProjectTeamRepository } from "./infrastructure/postgres/project-team-repository.js";
import { PostgresRiskRepository } from "./infrastructure/postgres/risk-repository.js";
import { PostgresSearchRepository } from "./infrastructure/postgres/search-repository.js";
import { PostgresSetupRepository } from "./infrastructure/postgres/setup-repository.js";
import { PostgresTaskRepository } from "./infrastructure/postgres/task-repository.js";

const config = loadConfig();
const pool = createPostgresPool(config.DATABASE_URL);
const auditRepository = new PostgresAuditRepository(pool);
const projectsRepository = new PostgresProjectsRepository(pool);
const overviewService = new OverviewService(new PostgresOverviewRepository(pool));
const activityRepository = new PostgresActivityRepository(pool);
const activityService = new ActivityService(activityRepository);
const projectService = new ProjectService(
  projectsRepository,
  auditRepository,
);
const projectTeamService = new ProjectTeamService(
  projectsRepository,
  new PostgresProjectTeamRepository(pool),
  auditRepository,
);
const taskService = new TaskService(
  new PostgresTaskRepository(pool),
  projectTeamService,
  auditRepository,
);
const riskService = new RiskService(
  new PostgresRiskRepository(pool),
  projectTeamService,
  auditRepository,
);
const searchService = new SearchService(new PostgresSearchRepository(pool));
const loginThrottle = new InMemoryLoginThrottle();
const passwordHasher = new ScryptPasswordHasher();
const authRepository = new PostgresAuthRepository(pool);
const authService = new AuthService(
  authRepository,
  passwordHasher,
  auditRepository,
  config.SESSION_JWT_SECRET,
  loginThrottle,
);
const profileService = new ProfileService(
  new PostgresProfileRepository(pool),
  passwordHasher,
  auditRepository,
  loginThrottle,
);
const emailSettingsRepository = new PostgresEmailSettingsRepository(pool);
const emailSender = new NodemailerEmailSender();
const authLifecycleService = new AuthLifecycleService(
  new PostgresAuthTokenRepository(pool),
  new SmtpNotificationSender(emailSettingsRepository, emailSender),
  passwordHasher,
  auditRepository,
  // Links in email must be absolute and point at the deployment, which only
  // the environment knows.
  resolveAppBaseUrl(config),
  loginThrottle,
);
const adminService = new AdminService(
  new PostgresAdminRepository(pool),
  passwordHasher,
  auditRepository,
  authRepository,
  authLifecycleService,
);
const setupService = new SetupService(
  new PostgresSetupRepository(pool),
  passwordHasher,
  auditRepository,
  config.SESSION_JWT_SECRET,
);
const emailSettingsService = new EmailSettingsService(
  emailSettingsRepository,
  emailSender,
  auditRepository,
);
const passkeyService = new PasskeyService(
  new PostgresPasskeyRepository(pool),
  auditRepository,
  config.SESSION_JWT_SECRET,
);

const server = await createServer({
  overviewService,
  activityService,
  projectService,
  projectTeamService,
  taskService,
  riskService,
  searchService,
  profileService,
  authLifecycleService,
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

/*
 * Retention runs in the process rather than as a migration: migrations execute
 * once, so a purge written there would clear the backlog on its deploy day and
 * never run again.
 */
const stopRetention = new RetentionService(activityRepository, server.log).start();

const shutdown = async () => {
  stopRetention();
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
