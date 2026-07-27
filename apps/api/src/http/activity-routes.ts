/** Activity routes expose the audit trail, scoped by the service to the caller. */
import type { FastifyInstance } from "fastify";
import type { ActivityService } from "../application/activity-service.js";

export async function registerActivityRoutes(
  app: FastifyInstance,
  activityService: Pick<ActivityService, "list" | "listActions">,
): Promise<void> {
  app.get("/v1/activity", async (request) => activityService.list(request.principal, request.query));

  app.get("/v1/activity/actions", async (request) => activityService.listActions(request.principal));
}
