/**
 * Fastify server composition wires security hooks, health endpoints, API routes,
 * and optional production static web serving without fake users or data.
 */
import cors from "@fastify/cors";
import fastify from "fastify";
import helmet from "@fastify/helmet";
import staticFiles from "@fastify/static";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ActivityService } from "../application/activity-service.js";
import type { AdminService } from "../application/admin-service.js";
import type { AuthService } from "../application/auth-service.js";
import type { OverviewService } from "../application/overview-service.js";
import type { AuthLifecycleService } from "../application/auth-lifecycle-service.js";
import type { ProfileService } from "../application/profile-service.js";
import type { ProjectService } from "../application/project-service.js";
import type { ProjectTeamService } from "../application/project-team-service.js";
import type { RiskService } from "../application/risk-service.js";
import type { SearchService } from "../application/search-service.js";
import type { AiService } from "../application/ai-service.js";
import type { AiSettingsService } from "../application/ai-settings-service.js";
import type { DirectoryService } from "../application/directory-service.js";
import type { SetupService } from "../application/setup-service.js";
import type { TaskService } from "../application/task-service.js";
import type { PasskeyService } from "../application/passkey-service.js";
import type { EmailSettingsService } from "../application/email-settings-service.js";
import { createAuthenticationHook } from "./auth.js";
import { registerActivityRoutes } from "./activity-routes.js";
import { registerAdminRoutes } from "./admin-routes.js";
import { registerDirectoryRoutes } from "./directory-routes.js";
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
import { registerAiRoutes } from "./ai-routes.js";
import { registerPasskeyRoutes } from "./passkey-routes.js";

export interface ServerDependencies {
  activityService: Pick<ActivityService, "list" | "listActions">;
  overviewService: Pick<OverviewService, "getSummary">;
  authLifecycleService: AuthLifecycleService;
  profileService: Pick<ProfileService, "getProfile" | "updateProfile" | "changePassword">;
  projectService: ProjectService;
  riskService: Pick<RiskService, "createRisk" | "listRisks" | "getRisk" | "updateRisk" | "deleteRisk" | "summarise">;
  searchService: Pick<SearchService, "search">;
  aiService: Pick<
    AiService,
    | "chat"
    | "confirm"
    | "listConversations"
    | "readConversation"
    | "renameConversation"
    | "deleteConversation"
  >;
  aiSettingsService: Pick<
    AiSettingsService,
    "getSettings" | "saveSettings" | "saveMyKey" | "deleteMyKey"
  >;
  directoryService: Pick<
    DirectoryService,
    "listCompanyDirectory" | "listColleagues" | "availableRegisters"
  >;
  taskService: Pick<TaskService, "createTask" | "listTasks" | "getTask" | "updateTask" | "deleteTask" | "listComments" | "addComment">;
  projectTeamService: ProjectTeamService;
  authService: AuthService;
  adminService: Pick<
    AdminService,
    | "listPermissions"
    | "listUserTypes"
    | "createUserType"
    | "updateUserType"
    | "listUsers"
    | "createUser"
    | "updateUser"
    | "listSeparationRules"
    | "previewSeparationRule"
    | "createSeparationRule"
    | "deleteSeparationRule"
    | "getPermissionReference"
  >;
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

/**
 * A request body larger than this is refused before it is parsed.
 *
 * Fastify's default is 1MB, which is already sensible, but it is stated here
 * because the ceiling is a deliberate product decision rather than a framework
 * default: nothing this API accepts today is a file. When document upload
 * arrives it will stream to object storage rather than raise this number, so
 * the JSON ceiling stays where it is.
 */
const MAX_JSON_BODY_BYTES = 256 * 1024;

export async function createServer(dependencies: ServerDependencies) {
  const app = fastify({
    logger: dependencies.logger ?? true,
    bodyLimit: MAX_JSON_BODY_BYTES,
    ajv: {
      customOptions: {
        removeAdditional: false,
        coerceTypes: false,
        allErrors: true,
      },
    },
  });

  app.setErrorHandler(errorHandler);

  /*
   * Security response headers. The app had none: no CSP, no nosniff, no
   * frame protection, no HSTS — verified against the deployed environment
   * rather than assumed.
   *
   * The CSP is written for this app specifically rather than left at helmet's
   * defaults. Vite emits a small inline bootstrap and the app sets styles from
   * design tokens at runtime, so `style-src` allows inline while `script-src`
   * does not — an inline-script allowance is the one that turns a content
   * injection into code execution, so it is the one worth refusing.
   */
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        "default-src": ["'self'"],
        "base-uri": ["'self'"],
        "font-src": ["'self'", "data:"],
        "form-action": ["'self'"],
        "frame-ancestors": ["'none'"],
        "img-src": ["'self'", "data:", "blob:"],
        "object-src": ["'none'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "connect-src": ["'self'"],
        "manifest-src": ["'self'"],
        "upgrade-insecure-requests": [],
      },
    },
    // Only meaningful over HTTPS, and asserting it from a local HTTP run would
    // pin a developer's browser to a scheme the dev server does not speak.
    strictTransportSecurity:
      process.env.NODE_ENV === "production"
        ? { maxAge: 31536000, includeSubDomains: true }
        : false,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "no-referrer" },
  });

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
  await registerActivityRoutes(app, dependencies.activityService);
  await registerProjectRoutes(app, dependencies.projectService, dependencies.projectTeamService);
  await registerProfileRoutes(app, dependencies.profileService);
  await registerProfileEmailRoutes(app, dependencies.authLifecycleService);
  await registerSearchRoutes(app, dependencies.searchService);
  await registerTaskRoutes(app, dependencies.taskService);
  await registerRiskRoutes(app, dependencies.riskService);
  await registerAdminRoutes(app, dependencies.adminService);
  await registerDirectoryRoutes(app, dependencies.directoryService);
  await registerAiRoutes(app, dependencies.aiService, dependencies.aiSettingsService);
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
