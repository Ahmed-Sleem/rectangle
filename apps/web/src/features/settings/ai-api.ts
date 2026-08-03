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

/** One configuration, as the browser is allowed to see it. Never the key. */
export interface AiProviderView {
  configured: boolean;
  baseUrl?: string;
  model?: string;
  hasKey: boolean;
  maxCycles: number;
  maxOutputTokens: number;
}

/**
 * The assistant's configuration for this person.
 *
 * Two independent providers, not one with overrides. The company's is shared;
 * a personal one is complete in itself and paid for by whoever set it up.
 * `active` says which is in use and `canChoose` whether there is a decision to
 * make — both resolved by the server, because a second implementation of that
 * rule in the browser is a second answer waiting to disagree with the first.
 */
export interface AiSettingsView {
  company: AiProviderView;
  enabled: boolean;
  personal: AiProviderView;
  active: "company" | "personal" | "none";
  canChoose: boolean;
  ready: boolean;
  updatedAt?: string;
}

export interface AiSettingsPayload {
  baseUrl: string;
  model: string;
  /** Omitted means "keep the key already saved". */
  apiKey?: string;
  enabled: boolean;
  /** Omitted keeps the saved budget rather than resetting it. */
  maxCycles?: number;
  /** Longest reply the model may generate. Omitted keeps the saved value. */
  maxOutputTokens?: number;
}

/**
 * A person's own provider. Complete, not a set of overrides.
 *
 * Endpoint and model are required because a personal configuration stands
 * alone: it does not borrow the company's endpoint, and half of one is not a
 * provider. The key may be omitted on a later save to keep the stored one,
 * which is the only way to change a model without retyping a secret nobody can
 * read back.
 */
export interface AiPersonalPayload {
  baseUrl: string;
  model: string;
  apiKey?: string;
  maxCycles?: number;
  maxOutputTokens?: number;
}

export const aiApi = {
  getSettings: () => apiRequest<{ aiSettings: AiSettingsView }>("/v1/ai/settings"),

  saveSettings: (payload: AiSettingsPayload) =>
    apiRequest<{ aiSettings: AiSettingsView }>("/v1/ai/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  saveMine: (payload: AiPersonalPayload) =>
    apiRequest<{ aiSettings: AiSettingsView }>("/v1/ai/me", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  /** Chooses between two configurations that both exist. */
  choose: (preferred: "company" | "personal") =>
    apiRequest<{ aiSettings: AiSettingsView }>("/v1/ai/me/preferred", {
      method: "PUT",
      body: JSON.stringify({ preferred }),
    }),

  /** Removes the personal configuration entirely. */
  deleteMine: () =>
    apiRequest<{ aiSettings: AiSettingsView }>("/v1/ai/me", { method: "DELETE" }),

  /*
   * The tools this person has agreed the assistant may use without asking.
   *
   * Granting happens on the confirmation card, in the moment; revoking belongs
   * here, because somebody who wants to undo it is not in the middle of a
   * conversation — they are looking for the setting. Without this screen a tick
   * on the card was permanent from the person's point of view, which makes
   * "don't ask again" a much bigger decision than it looks.
   */
  listAutoApprovals: () => apiRequest<{ tools: string[] }>("/v1/ai/auto-approvals"),

  revokeAutoApproval: (tool: string) =>
    apiRequest<{ tools: string[] }>("/v1/ai/auto-approvals", {
      method: "DELETE",
      body: JSON.stringify({ tool }),
    }),
};
