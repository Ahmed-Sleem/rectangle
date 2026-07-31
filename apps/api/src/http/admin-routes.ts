/** Tenant administration routes manage user types and users with real permissions. */
import type { FastifyInstance } from "fastify";
import type { AdminService } from "../application/admin-service.js";

export async function registerAdminRoutes(
  app: FastifyInstance,
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
  >,
): Promise<void> {
  app.get("/v1/admin/permissions", async (request) => adminService.listPermissions(request.principal));

  app.get("/v1/admin/user-types", async (request) => adminService.listUserTypes(request.principal));

  app.post("/v1/admin/user-types", async (request, reply) => {
    const result = await adminService.createUserType(request.principal, request.body);
    return reply.status(201).send(result);
  });

  app.patch<{ Params: { userTypeId: string } }>("/v1/admin/user-types/:userTypeId", async (request) =>
    adminService.updateUserType(request.principal, request.params.userTypeId, request.body),
  );

  app.get("/v1/admin/users", async (request) => adminService.listUsers(request.principal));

  app.post("/v1/admin/users", async (request, reply) => {
    const result = await adminService.createUser(request.principal, request.body);
    return reply.status(201).send(result);
  });

  app.patch<{ Params: { userId: string } }>("/v1/admin/users/:userId", async (request) =>
    adminService.updateUser(request.principal, request.params.userId, request.body),
  );

  /*
   * The whole access model in one response. Composed on the server so the page
   * cannot compute a different answer from the guards that enforce it.
   */
  app.get("/v1/admin/permission-reference", async (request) =>
    adminService.getPermissionReference(request.principal),
  );

  app.get("/v1/admin/separation-rules", async (request) =>
    adminService.listSeparationRules(request.principal),
  );

  /*
   * A POST, though it changes nothing. It carries a permission pair in the body
   * rather than the query string, and asking "what would this cost" is a
   * question about a proposed rule rather than a fetch of an addressable thing.
   */
  app.post("/v1/admin/separation-rules/preview", async (request) =>
    adminService.previewSeparationRule(request.principal, request.body),
  );

  app.post("/v1/admin/separation-rules", async (request, reply) => {
    const result = await adminService.createSeparationRule(request.principal, request.body);
    return reply.status(201).send(result);
  });

  app.delete<{ Params: { ruleId: string } }>("/v1/admin/separation-rules/:ruleId", async (request, reply) => {
    await adminService.deleteSeparationRule(request.principal, request.params.ruleId);
    return reply.status(204).send();
  });
}
