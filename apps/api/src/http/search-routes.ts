/** Global search route. Read-only, permission-scoped inside the service. */
import type { FastifyInstance } from "fastify";
import type { SearchService } from "../application/search-service.js";

export async function registerSearchRoutes(
  app: FastifyInstance,
  searchService: Pick<SearchService, "search">,
): Promise<void> {
  app.get("/v1/search", async (request) => {
    return { results: await searchService.search(request.principal, request.query) };
  });
}
