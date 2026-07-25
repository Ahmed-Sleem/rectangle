/**
 * Projects HTTP routes expose real tenant-scoped project operations through the
 * ProjectService so validation, permissions, and audit behavior stay central.
 */
import type { FastifyInstance } from "fastify";
import type { ProjectService } from "../application/project-service.js";
import type { ProjectTeamService } from "../application/project-team-service.js";

type ProjectParams = { projectId: string };
type MemberParams = ProjectParams & { userId: string };
type StakeholderParams = ProjectParams & { stakeholderId: string };

export async function registerProjectRoutes(
  app: FastifyInstance,
  projectService: ProjectService,
  projectTeamService: ProjectTeamService,
): Promise<void> {
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

  // Tells the client what this user may do here, so the UI can hide actions
  // instead of showing controls that would fail.
  app.delete<{ Params: ProjectParams }>("/v1/projects/:projectId", async (request, reply) => {
    await projectService.deleteProject(request.principal, request.params.projectId);
    return reply.status(204).send();
  });

  app.get<{ Params: ProjectParams }>("/v1/projects/:projectId/access", async (request) => {
    return { access: await projectTeamService.resolveAccess(request.principal, request.params.projectId) };
  });

  app.get<{ Params: ProjectParams }>("/v1/projects/:projectId/members", async (request) => {
    return { members: await projectTeamService.listMembers(request.principal, request.params.projectId) };
  });

  app.post<{ Params: ProjectParams }>("/v1/projects/:projectId/members", async (request, reply) => {
    const member = await projectTeamService.addMember(
      request.principal,
      request.params.projectId,
      request.body,
    );
    return reply.status(201).send({ member });
  });

  app.patch<{ Params: MemberParams }>("/v1/projects/:projectId/members/:userId", async (request) => {
    const member = await projectTeamService.updateMemberRole(
      request.principal,
      request.params.projectId,
      request.params.userId,
      request.body,
    );
    return { member };
  });

  app.delete<{ Params: MemberParams }>("/v1/projects/:projectId/members/:userId", async (request, reply) => {
    await projectTeamService.removeMember(
      request.principal,
      request.params.projectId,
      request.params.userId,
    );
    return reply.status(204).send();
  });

  app.get<{ Params: ProjectParams }>("/v1/projects/:projectId/stakeholders", async (request) => {
    return {
      stakeholders: await projectTeamService.listStakeholders(
        request.principal,
        request.params.projectId,
      ),
    };
  });

  app.post<{ Params: ProjectParams }>("/v1/projects/:projectId/stakeholders", async (request, reply) => {
    const stakeholder = await projectTeamService.createStakeholder(
      request.principal,
      request.params.projectId,
      request.body,
    );
    return reply.status(201).send({ stakeholder });
  });

  app.patch<{ Params: StakeholderParams }>(
    "/v1/projects/:projectId/stakeholders/:stakeholderId",
    async (request) => {
      const stakeholder = await projectTeamService.updateStakeholder(
        request.principal,
        request.params.projectId,
        request.params.stakeholderId,
        request.body,
      );
      return { stakeholder };
    },
  );

  app.delete<{ Params: StakeholderParams }>(
    "/v1/projects/:projectId/stakeholders/:stakeholderId",
    async (request, reply) => {
      await projectTeamService.deleteStakeholder(
        request.principal,
        request.params.projectId,
        request.params.stakeholderId,
      );
      return reply.status(204).send();
    },
  );

  app.get<{ Params: ProjectParams }>("/v1/projects/:projectId/activity", async (request) => {
    return {
      activity: await projectTeamService.listActivity(
        request.principal,
        request.params.projectId,
        request.query,
      ),
    };
  });
}
