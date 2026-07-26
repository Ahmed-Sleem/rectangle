/**
 * Risk register routes. Creation hangs off the project because a risk cannot
 * exist without one; everything after addresses the entry directly.
 */
import type { FastifyInstance } from "fastify";
import type { RiskService } from "../application/risk-service.js";

type RiskParams = { riskId: string };
type ProjectParams = { projectId: string };

export async function registerRiskRoutes(
  app: FastifyInstance,
  riskService: Pick<
    RiskService,
    "createRisk" | "listRisks" | "getRisk" | "updateRisk" | "deleteRisk" | "summarise"
  >,
): Promise<void> {
  app.get("/v1/risks", async (request) => {
    return { risks: await riskService.listRisks(request.principal, request.query) };
  });

  app.get<{ Querystring: { projectId?: string } }>("/v1/risks/summary", async (request) => {
    return { summary: await riskService.summarise(request.principal, request.query.projectId) };
  });

  app.post<{ Params: ProjectParams }>("/v1/projects/:projectId/risks", async (request, reply) => {
    const risk = await riskService.createRisk(request.principal, request.params.projectId, request.body);
    return reply.status(201).send({ risk });
  });

  app.get<{ Params: RiskParams }>("/v1/risks/:riskId", async (request) => {
    return { risk: await riskService.getRisk(request.principal, request.params.riskId) };
  });

  app.patch<{ Params: RiskParams }>("/v1/risks/:riskId", async (request) => {
    return { risk: await riskService.updateRisk(request.principal, request.params.riskId, request.body) };
  });

  app.delete<{ Params: RiskParams }>("/v1/risks/:riskId", async (request, reply) => {
    await riskService.deleteRisk(request.principal, request.params.riskId);
    return reply.status(204).send();
  });
}
