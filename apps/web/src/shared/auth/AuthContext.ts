/** Shared auth context types and object for the production session provider. */
import { createContext } from "react";

export interface RectangleUser {
  tenantId: string;
  userId: string;
  roles: string[];
  permissions: string[];
  sessionId?: string;
  /**
   * Who the person is, resolved live from their user row on every request.
   * Optional only because a session-less token cannot supply it; the API
   * refuses those, so in practice it is always present.
   */
  displayName?: string;
  email?: string;
}

export interface AuthContextValue {
  setupRequired: boolean | undefined;
  user: RectangleUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
