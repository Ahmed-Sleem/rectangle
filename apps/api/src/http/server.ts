/**
 * Fastify server composition wires security hooks, health endpoints, API routes,
 * and optional production static web serving without fake users or data.
 */
import cors from "@fastify/cors";
import fastify from "fastify";
import staticFiles from "@fastify/static";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AuthService } from "../application/auth-service.js";
import type { ProjectService } from "../application/project-service.js";
import type { SetupService } from "../application/setup-service.js";
import { createAuthenticationHook } from "./auth.js";
import { registerAuthRoutes } from "./auth-routes.js";
import { errorHandler } from "./errors.js";
import { registerProjectRoutes } from "./projects-routes.js";
import { registerSetupRoutes } from "./setup-routes.js";

export interface ServerDependencies {
  projectService: ProjectService;
  authService: AuthService;
  setupService: Pick<SetupService, "getStatus" | "createFirstAdmin">;
  jwtSecret: string;
  corsOrigin?: string;
  webDistPath?: string;
  readinessCheck?: () => Promise<void>;
  logger?: boolean;
}

function isPublicRoute(url: string): boolean {
  return url.startsWith("/health/") || url === "/v1/auth/login" || url.startsWith("/v1/setup/") || !url.startsWith("/v1/");
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

  app.addHook("preHandler", async (request, reply) => {
    if (isPublicRoute(request.url)) {
      return;
    }
    await createAuthenticationHook(
      dependencies.jwtSecret,
      (sessionId, tenantId, userId) => dependencies.authService.verifySession(sessionId, tenantId, userId),
    )(request, reply);
  });

  await registerProjectRoutes(app, dependencies.projectService);

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
