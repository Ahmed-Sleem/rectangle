/** API helpers for tenant-level settings. */
import { apiRequest } from "@/shared/api/client";

export interface EmailSettingsView {
  configured: boolean;
  enabled: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
  fromEmail?: string;
  fromName?: string;
  hasPassword: boolean;
}

export interface EmailSettingsPayload {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password?: string;
  fromEmail: string;
  fromName: string;
}

export const settingsApi = {
  getEmail: () => apiRequest<{ emailSettings: EmailSettingsView }>("/v1/settings/email"),
  saveEmail: (payload: EmailSettingsPayload) => apiRequest<{ emailSettings: EmailSettingsView }>("/v1/settings/email", { method: "PUT", body: JSON.stringify(payload) }),
  testEmail: (recipientEmail: string) => apiRequest<{ sent: true }>("/v1/settings/email/test", { method: "POST", body: JSON.stringify({ recipientEmail }) }),
};
