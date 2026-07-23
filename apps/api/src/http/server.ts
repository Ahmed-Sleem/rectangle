/**
 * Fastify server composition wires security hooks, health endpoints, and
 * versioned Rectangle API routes without embedding test data or fake users.
 */
import cors from "@fastify/cors";
import fastify from "fastify";
import type { ProjectService } from "../application/project-service.js";
import { createAuthenticationHook } from "./auth.js";
import { errorHandler } from "./errors.js";
import { registerProjectRoutes } from "./projects-routes.js";

export interface ServerDependencies {
  projectService: ProjectService;
  jwtSecret: string;
  corsOrigin: string;
  readinessCheck?: () => Promise<void>;
  logger?: boolean;
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
  await app.register(cors, { origin: dependencies.corsOrigin, credentials: true });

  app.get("/health/live", async () => ({ status: "ok" }));
  app.get("/health/ready", async (_request, reply) => {
    if (dependencies.readinessCheck) {
      await dependencies.readinessCheck();
    }
    return reply.send({ status: "ready" });
  });

  app.addHook("preHandler", async (request, reply) => {
    if (request.url.startsWith("/health/")) {
      return;
    }
    await createAuthenticationHook(dependencies.jwtSecret)(request, reply);
  });

  await registerProjectRoutes(app, dependencies.projectService);
  return app;
}
