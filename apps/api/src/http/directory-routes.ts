/**
 * The people register.
 *
 * Two endpoints rather than one with a parameter, because they are governed
 * differently: the company register is an administrative view behind
 * `users.read`, and the colleague register is open to every signed-in person.
 * One endpoint switching on a query string would put both behind whichever
 * guard was written first.
 */
import type { FastifyInstance } from "fastify";
import type { DirectoryService } from "../application/directory-service.js";

export async function registerDirectoryRoutes(
  app: FastifyInstance,
  directoryService: Pick<
    DirectoryService,
    "listCompanyDirectory" | "listColleagues" | "availableRegisters"
  >,
): Promise<void> {
  /*
   * Which registers this caller may open. The page asks first so it can offer
   * only the tabs that exist for them, rather than rendering one that answers
   * with a refusal.
   */
  app.get("/v1/directory/registers", async (request) => ({
    registers: directoryService.availableRegisters(request.principal),
  }));

  app.get("/v1/directory/company", async (request) =>
    directoryService.listCompanyDirectory(request.principal),
  );

  app.get("/v1/directory/colleagues", async (request) =>
    directoryService.listColleagues(request.principal),
  );
}
