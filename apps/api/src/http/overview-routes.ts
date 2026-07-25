/**
 * Today / Command Center route. Read-only, so a single GET carries the whole
 * surface: the blocks are cheap aggregates and splitting them would make the
 * first screen after sign-in wait on several round trips.
 */
import type { FastifyInstance } from "fastify";
import type { OverviewService } from "../application/overview-service.js";

export async function registerOverviewRoutes(
  app: FastifyInstance,
  overviewService: Pick<OverviewService, "getSummary">,
): Promise<void> {
  app.get("/v1/overview", async (request) => {
    return { overview: await overviewService.getSummary(request.principal, request.query) };
  });
}
