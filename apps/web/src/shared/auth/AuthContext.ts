/** Shared auth context types and object for the production session provider. */
import { createContext } from "react";

export interface RectangleUser {
  tenantId: string;
  userId: string;
  roles: string[];
  sessionId?: string;
}

export interface AuthContextValue {
  setupRequired: boolean | undefined;
  user: RectangleUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
