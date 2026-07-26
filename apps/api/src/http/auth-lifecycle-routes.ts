/**
 * Invitation, password reset, and email change routes.
 *
 * The accept and confirm endpoints are deliberately public: the person using
 * them has no session yet, or is proving control of an address precisely
 * because their session cannot vouch for it. Their authorisation is the token,
 * which the service verifies.
 */
import type { FastifyInstance } from "fastify";
import type { AuthLifecycleService } from "../application/auth-lifecycle-service.js";

type Service = Pick<
  AuthLifecycleService,
  | "requestPasswordReset"
  | "confirmPasswordReset"
  | "describeInvitation"
  | "acceptInvitation"
  | "requestEmailChange"
  | "confirmEmailChange"
  | "revertEmailChange"
>;

export async function registerAuthLifecycleRoutes(
  app: FastifyInstance,
  service: Service,
): Promise<void> {
  app.post("/v1/auth/password-reset", async (request) =>
    service.requestPasswordReset(request.body),
  );

  app.post("/v1/auth/password-reset/confirm", async (request) =>
    service.confirmPasswordReset(request.body),
  );

  app.get<{ Querystring: { token?: string } }>("/v1/auth/invitation", async (request) => ({
    invitation: await service.describeInvitation(request.query.token),
  }));

  app.post("/v1/auth/invitation/accept", async (request) =>
    service.acceptInvitation(request.body),
  );

  app.post("/v1/auth/email-change/confirm", async (request) =>
    service.confirmEmailChange((request.body as { token?: string } | undefined)?.token),
  );

  app.post("/v1/auth/email-change/revert", async (request) =>
    service.revertEmailChange((request.body as { token?: string } | undefined)?.token),
  );
}

/** Requires a session: only the account's owner may start the change. */
export async function registerProfileEmailRoutes(
  app: FastifyInstance,
  service: Pick<AuthLifecycleService, "requestEmailChange">,
): Promise<void> {
  app.post("/v1/profile/email", async (request) =>
    service.requestEmailChange(request.principal, request.body),
  );
}
