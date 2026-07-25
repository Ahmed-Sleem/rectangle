/**
 * Self-service profile routes.
 *
 * None of these take a user id: they act on whoever is making the request.
 * A profile endpoint accepting an id would be an admin endpoint under the
 * wrong name, and would need the permission checks that go with one.
 */
import type { FastifyInstance } from "fastify";
import type { ProfileService } from "../application/profile-service.js";

export async function registerProfileRoutes(
  app: FastifyInstance,
  profileService: Pick<ProfileService, "getProfile" | "updateProfile" | "changePassword">,
): Promise<void> {
  app.get("/v1/profile", async (request) => {
    return { profile: await profileService.getProfile(request.principal) };
  });

  app.patch("/v1/profile", async (request) => {
    return { profile: await profileService.updateProfile(request.principal, request.body) };
  });

  app.post("/v1/profile/password", async (request) => {
    return profileService.changePassword(request.principal, request.body);
  });
}
