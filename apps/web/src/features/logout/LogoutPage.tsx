/** Logout route ends the real server session and returns to login. */
import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { apiRequest } from "@/shared/api/client";
import { useAuth } from "@/shared/auth";
import { LoadingState } from "@/shared/ui";

export default function LogoutPage() {
  const auth = useAuth();
  const logout = useMutation({
    mutationFn: () => apiRequest<void>("/v1/auth/logout", { method: "POST" }),
    onSettled: () => auth.refresh(),
  });

  useEffect(() => {
    if (!logout.isIdle) return;
    logout.mutate();
  }, [logout]);

  if (logout.isSuccess || !auth.user) return <Navigate to="/login" replace />;
  return <LoadingState title="Signing out" message="Ending your Rectangle session…" />;
}
