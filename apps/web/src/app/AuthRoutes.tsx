/** Route guards keep setup/login/app access aligned with real server state. */
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { LoadingState } from "@/shared/ui";
import { useAuth } from "@/shared/auth";
import { AppShellLayout } from "./AppShellLayout";

function FullPageGate({ children }: { children: ReactNode }) {
  return <div className="rect-auth-screen">{children}</div>;
}

export function ProtectedShellRoute() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading) return <FullPageGate><LoadingState title="Loading" message="Preparing Rectangle…" /></FullPageGate>;
  if (auth.setupRequired) return <Navigate to="/setup" replace />;
  if (!auth.user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <AppShellLayout />;
}

export function SetupRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (auth.loading) return <FullPageGate><LoadingState title="Loading" message="Checking setup…" /></FullPageGate>;
  if (!auth.setupRequired && auth.user) return <Navigate to="/" replace />;
  if (!auth.setupRequired) return <Navigate to="/login" replace />;
  return <FullPageGate>{children}</FullPageGate>;
}

export function LoginRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (auth.loading) return <FullPageGate><LoadingState title="Loading" message="Checking session…" /></FullPageGate>;
  if (auth.setupRequired) return <Navigate to="/setup" replace />;
  if (auth.user) return <Navigate to="/" replace />;
  return <FullPageGate>{children}</FullPageGate>;
}
