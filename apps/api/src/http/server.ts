/**
 * Fastify server composition wires security hooks, health endpoints, API routes,
 * and optional production static web serving without fake users or data.
 */
import cors from "@fastify/cors";
import fastify from "fastify";
import staticFiles from "@fastify/static";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AdminService } from "../application/admin-service.js";
import type { AuthService } from "../application/auth-service.js";
import type { OverviewService } from "../application/overview-service.js";
import type { AuthLifecycleService } from "../application/auth-lifecycle-service.js";
import type { ProfileService } from "../application/profile-service.js";
import type { ProjectService } from "../application/project-service.js";
import type { ProjectTeamService } from "../application/project-team-service.js";
import type { RiskService } from "../application/risk-service.js";
import type { SearchService } from "../application/search-service.js";
import type { SetupService } from "../application/setup-service.js";
import type { TaskService } from "../application/task-service.js";
import type { PasskeyService } from "../application/passkey-service.js";
import type { EmailSettingsService } from "../application/email-settings-service.js";
import { createAuthenticationHook } from "./auth.js";
import { registerAdminRoutes } from "./admin-routes.js";
import { registerAuthRoutes } from "./auth-routes.js";
import { errorHandler } from "./errors.js";
import { registerOverviewRoutes } from "./overview-routes.js";
import { registerAuthLifecycleRoutes, registerProfileEmailRoutes } from "./auth-lifecycle-routes.js";
import { registerProfileRoutes } from "./profile-routes.js";
import { registerProjectRoutes } from "./projects-routes.js";
import { registerRiskRoutes } from "./risks-routes.js";
import { registerSearchRoutes } from "./search-routes.js";
import { registerSetupRoutes } from "./setup-routes.js";
import { registerTaskRoutes } from "./tasks-routes.js";
import { registerSettingsRoutes } from "./settings-routes.js";
import { registerPasskeyRoutes } from "./passkey-routes.js";

export interface ServerDependencies {
  overviewService: Pick<OverviewService, "getSummary">;
  authLifecycleService: AuthLifecycleService;
  profileService: Pick<ProfileService, "getProfile" | "updateProfile" | "changePassword">;
  projectService: ProjectService;
  riskService: Pick<RiskService, "createRisk" | "listRisks" | "getRisk" | "updateRisk" | "deleteRisk" | "summarise">;
  searchService: Pick<SearchService, "search">;
  taskService: Pick<TaskService, "createTask" | "listTasks" | "getTask" | "updateTask" | "deleteTask" | "listComments" | "addComment">;
  projectTeamService: ProjectTeamService;
  authService: AuthService;
  adminService: Pick<AdminService, "listPermissions" | "listUserTypes" | "createUserType" | "updateUserType" | "listUsers" | "createUser" | "updateUser">;
  setupService: Pick<SetupService, "getStatus" | "createFirstAdmin">;
  emailSettingsService: Pick<EmailSettingsService, "getSettings" | "saveSettings" | "sendTestEmail">;
  passkeyService: Pick<PasskeyService, "list" | "beginRegistration" | "verifyRegistration" | "beginLogin" | "verifyLogin">;
  jwtSecret: string;
  corsOrigin?: string;
  webDistPath?: string;
  readinessCheck?: () => Promise<void>;
  logger?: boolean;
}

function isPublicRoute(url: string): boolean {
  // Lifecycle endpoints are reached by people with no session: their
  // authorisation is the token in the request, checked by the service.
  const publicLifecycle =
    url.startsWith("/v1/auth/password-reset") ||
    url.startsWith("/v1/auth/invitation") ||
    url.startsWith("/v1/auth/email-change/");

  return (
    url.startsWith("/health/") ||
    url === "/v1/auth/login" ||
    url.startsWith("/v1/auth/passkeys/login/") ||
    url.startsWith("/v1/setup/") ||
    publicLifecycle ||
    !url.startsWith("/v1/")
  );
}

export async function createServer(dependencies: ServerDependencies) {
  const app = fastify({
    logger: dependencies.logger ?? true,
    ajv: {
      customOptions: {
        removeAdditional: false,
        coerceTypes: false,
        allErrors: true,
      },
    },
  });

  app.setErrorHandler(errorHandler);
  if (dependencies.corsOrigin) {
    await app.register(cors, { origin: dependencies.corsOrigin, credentials: true });
  }

  app.get("/health/live", async () => ({ status: "ok" }));
  app.get("/health/ready", async (_request, reply) => {
    if (dependencies.readinessCheck) {
      await dependencies.readinessCheck();
    }
    return reply.send({ status: "ready" });
  });

  await registerSetupRoutes(app, dependencies.setupService);
  await registerAuthRoutes(app, dependencies.authService);
  await registerPasskeyRoutes(app, dependencies.passkeyService);
  await registerAuthLifecycleRoutes(app, dependencies.authLifecycleService);

  app.addHook("preHandler", async (request, reply) => {
    if (isPublicRoute(request.url)) {
      return;
    }
    await createAuthenticationHook(
      dependencies.jwtSecret,
      (sessionId, tenantId, userId) => dependencies.authService.resolveSession(sessionId, tenantId, userId),
    )(request, reply);
  });

  await registerOverviewRoutes(app, dependencies.overviewService);
  await registerProjectRoutes(app, dependencies.projectService, dependencies.projectTeamService);
  await registerProfileRoutes(app, dependencies.profileService);
  await registerProfileEmailRoutes(app, dependencies.authLifecycleService);
  await registerSearchRoutes(app, dependencies.searchService);
  await registerTaskRoutes(app, dependencies.taskService);
  await registerRiskRoutes(app, dependencies.riskService);
  await registerAdminRoutes(app, dependencies.adminService);
  await registerSettingsRoutes(app, dependencies.emailSettingsService);

  if (dependencies.webDistPath && existsSync(join(dependencies.webDistPath, "index.html"))) {
    await app.register(staticFiles, {
      root: dependencies.webDistPath,
      prefix: "/",
      decorateReply: true,
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/v1/") || request.url.startsWith("/health/")) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Route was not found." } });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
