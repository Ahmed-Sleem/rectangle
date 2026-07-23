/**
 * Projects HTTP routes expose real tenant-scoped project operations through the
 * ProjectService so validation, permissions, and audit behavior stay central.
 */
import type { FastifyInstance } from "fastify";
import type { ProjectService } from "../application/project-service.js";

export async function registerProjectRoutes(app: FastifyInstance, projectService: ProjectService): Promise<void> {
  app.get("/v1/projects", async (request) => {
    return { projects: await projectService.listProjects(request.principal, request.query) };
  });

  app.post("/v1/projects", async (request, reply) => {
    const project = await projectService.createProject(request.principal, request.body);
    return reply.status(201).send({ project });
  });

  app.get<{ Params: { projectId: string } }>("/v1/projects/:projectId", async (request) => {
    return { project: await projectService.getProject(request.principal, request.params.projectId) };
  });

  app.patch<{ Params: { projectId: string } }>("/v1/projects/:projectId", async (request) => {
    return { project: await projectService.updateProject(request.principal, request.params.projectId, request.body) };
  });
}
