/** Route guards keep setup/login/app access aligned with real server state. */
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "@/shared/auth";
import { AppShellLayout } from "./AppShellLayout";
import { BootScreen } from "./BootScreen";
import { WorkspaceReadyGate } from "./WorkspaceReadyGate";

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
  /*
   * The boot screen while the session is being resolved, not a card on an empty
   * page. This is the same wait the browser's first paint uses and it happens
   * in the same second, so showing a different thing here made signing in look
   * like three separate loads instead of one.
   */
  if (auth.loading) return <BootScreen label="Loading Rectangle" />;
  if (auth.setupRequired) return <Navigate to="/setup" replace />;
  if (!auth.user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  /*
   * Wrapped, so the workspace opens once and complete. The shell mounts
   * immediately underneath — that is what starts its queries — and is revealed
   * when nothing is left in flight.
   */
  return (
    <WorkspaceReadyGate>
      <AppShellLayout />
    </WorkspaceReadyGate>
  );
}

export function SetupRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (auth.loading) return <BootScreen label="Loading Rectangle" />;
  if (!auth.setupRequired && auth.user) return <Navigate to="/" replace />;
  if (!auth.setupRequired) return <Navigate to="/login" replace />;
  return <FullPageGate>{children}</FullPageGate>;
}

export function LoginRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (auth.loading) return <BootScreen label="Loading Rectangle" />;
  if (auth.setupRequired) return <Navigate to="/setup" replace />;
  if (auth.user) return <Navigate to="/" replace />;
  return <FullPageGate>{children}</FullPageGate>;
}
