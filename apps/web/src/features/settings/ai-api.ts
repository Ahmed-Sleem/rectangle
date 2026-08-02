/**
 * The assistant's configuration, as the browser is allowed to know it.
 *
 * Note what is absent: there is no field anywhere here that carries a key back
 * from the server. Keys go one way. The screen is told whether one is saved and
 * whether asking a question would work, which is everything it needs to explain
 * itself, and nothing that would put a credential into a response body where a
 * log, a proxy or a browser extension could find it.
 */
import { apiRequest } from "@/shared/api/client";

export interface AiSettingsView {
  /** Whether a provider has ever been saved for this company. */
  configured: boolean;
  enabled: boolean;
  baseUrl?: string;
  model?: string;
  hasCompanyKey: boolean;
  /** Whether the person asking has saved one of their own. */
  hasPersonalKey: boolean;
  /** Whether asking a question would work right now, for this person. */
  ready: boolean;
  updatedAt?: string;
}

export interface AiSettingsPayload {
  baseUrl: string;
  model: string;
  /** Omitted means "keep the key already saved". */
  apiKey?: string;
  enabled: boolean;
}

export const aiApi = {
  getSettings: () => apiRequest<{ aiSettings: AiSettingsView }>("/v1/ai/settings"),

  saveSettings: (payload: AiSettingsPayload) =>
    apiRequest<{ aiSettings: AiSettingsView }>("/v1/ai/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  saveMyKey: (apiKey: string) =>
    apiRequest<{ hasPersonalKey: true }>("/v1/ai/key", {
      method: "PUT",
      body: JSON.stringify({ apiKey }),
    }),

  deleteMyKey: () => apiRequest<{ hasPersonalKey: false }>("/v1/ai/key", { method: "DELETE" }),
};
