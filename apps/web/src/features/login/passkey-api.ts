/** Browser passkey helpers for real WebAuthn login ceremonies. */
import { startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { apiRequest } from "@/shared/api/client";

export async function loginWithPasskey(email: string) {
  const begin = await apiRequest<{ options: PublicKeyCredentialRequestOptionsJSON; userHandle: { tenantId: string; userId: string } }>("/v1/auth/passkeys/login/options", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  const response = await startAuthentication({ optionsJSON: begin.options });
  return apiRequest("/v1/auth/passkeys/login/verify", {
    method: "POST",
    body: JSON.stringify({ ...begin.userHandle, response }),
  });
}
