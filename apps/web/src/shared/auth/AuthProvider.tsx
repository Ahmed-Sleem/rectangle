/**
 * Auth provider reads real setup/session state from the API. It does not create
 * fake users or store bearer tokens in localStorage.
 */
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiClientError } from "@/shared/api/client";
import { AuthContext, type AuthContextValue, type RectangleUser } from "./AuthContext";

interface SetupStatusResponse {
  setupRequired: boolean;
}

interface MeResponse {
  user: RectangleUser;
}

async function loadMe(): Promise<RectangleUser | null> {
  try {
    const response = await apiRequest<MeResponse>("/v1/me");
    return response.user;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const setupQuery = useQuery({
    queryKey: ["setup-status"],
    queryFn: () => apiRequest<SetupStatusResponse>("/v1/setup/status"),
    retry: false,
  });
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: loadMe,
    retry: false,
  });

  const value = useMemo<AuthContextValue>(() => ({
    setupRequired: setupQuery.data?.setupRequired,
    user: meQuery.data ?? null,
    loading: setupQuery.isLoading || meQuery.isLoading,
    refresh: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["setup-status"] }),
        queryClient.invalidateQueries({ queryKey: ["me"] }),
      ]);
    },
  }), [meQuery.data, meQuery.isLoading, queryClient, setupQuery.data?.setupRequired, setupQuery.isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
