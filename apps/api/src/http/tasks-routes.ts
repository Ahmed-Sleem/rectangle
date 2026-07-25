/**
 * Task routes. Creation hangs off the project because a task cannot exist
 * without one; everything after that addresses the task directly.
 */
import type { FastifyInstance } from "fastify";
import type { TaskService } from "../application/task-service.js";

type TaskParams = { taskId: string };
type ProjectParams = { projectId: string };

export async function registerTaskRoutes(
  app: FastifyInstance,
  taskService: Pick<
    TaskService,
    "createTask" | "listTasks" | "getTask" | "updateTask" | "deleteTask" | "listComments" | "addComment"
  >,
): Promise<void> {
  app.get("/v1/tasks", async (request) => {
    return { tasks: await taskService.listTasks(request.principal, request.query) };
  });

  app.post<{ Params: ProjectParams }>("/v1/projects/:projectId/tasks", async (request, reply) => {
    const task = await taskService.createTask(request.principal, request.params.projectId, request.body);
    return reply.status(201).send({ task });
  });

  app.get<{ Params: TaskParams }>("/v1/tasks/:taskId", async (request) => {
    return { task: await taskService.getTask(request.principal, request.params.taskId) };
  });

  app.patch<{ Params: TaskParams }>("/v1/tasks/:taskId", async (request) => {
    return { task: await taskService.updateTask(request.principal, request.params.taskId, request.body) };
  });

  app.delete<{ Params: TaskParams }>("/v1/tasks/:taskId", async (request, reply) => {
    await taskService.deleteTask(request.principal, request.params.taskId);
    return reply.status(204).send();
  });

  app.get<{ Params: TaskParams }>("/v1/tasks/:taskId/comments", async (request) => {
    return { comments: await taskService.listComments(request.principal, request.params.taskId) };
  });

  app.post<{ Params: TaskParams }>("/v1/tasks/:taskId/comments", async (request, reply) => {
    const comment = await taskService.addComment(request.principal, request.params.taskId, request.body);
    return reply.status(201).send({ comment });
  });
}
