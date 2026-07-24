/** Tenant administration routes manage user types and users with real permissions. */
import type { FastifyInstance } from "fastify";
import type { AdminService } from "../application/admin-service.js";

export async function registerAdminRoutes(
  app: FastifyInstance,
  adminService: Pick<AdminService, "listPermissions" | "listUserTypes" | "createUserType" | "updateUserType" | "listUsers" | "createUser">,
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
}
