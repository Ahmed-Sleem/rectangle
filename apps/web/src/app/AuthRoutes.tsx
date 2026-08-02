/** Route guards keep setup/login/app access aligned with real server state. */
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { LoadingState } from "@/shared/ui";
import { useAuth } from "@/shared/auth";
import { AppShellLayout } from "./AppShellLayout";

/**
 * The centred full-page frame every pre-login screen sits in.
 *
 * Exported because the five pages reached from an email link — accepting an
 * invitation, requesting a reset, confirming one, and the two email-change
 * outcomes — are not behind any guard and so were rendering bare: no frame, no
 * centring, the card pinned to the top-left of an empty page. That is the
 * corrupted reset page the owner reported. They need the frame without the
 * redirect logic, so the frame is its own export rather than something only a
 * guard can apply.
 */
export function FullPageGate({ children }: { children: ReactNode }) {
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
