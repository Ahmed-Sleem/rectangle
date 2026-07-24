/** Browser passkey helpers for authenticated passkey registration. */
import { startRegistration, type PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { apiRequest } from "@/shared/api/client";

export interface PasskeyView { id: string; name: string; createdAt: string; lastUsedAt?: string }

export async function listPasskeys() {
  return apiRequest<{ passkeys: PasskeyView[] }>("/v1/auth/passkeys");
}

export async function registerPasskey() {
  const options = await apiRequest<PublicKeyCredentialCreationOptionsJSON>("/v1/auth/passkeys/register/options", { method: "POST" });
  const response = await startRegistration({ optionsJSON: options });
  return apiRequest("/v1/auth/passkeys/register/verify", { method: "POST", body: JSON.stringify(response) });
}
