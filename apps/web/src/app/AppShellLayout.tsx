/**
 * Owns shell-level state that must survive feature swaps: navigation collapse,
 * AI panel visibility, and the browser tab title for the active route.
 */
import { Suspense, useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AppShell } from "@/shell/AppShell";
import { getFeatureByPath } from "@/shell/registry";

const NAV_STORAGE_KEY = "rectangle.shell.navCollapsed";
const AI_STORAGE_KEY = "rectangle.shell.aiCollapsed";
const APP_NAME = "Rectangle";

function readStoredBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    if (value === null) return fallback;
    return value === "1";
  } catch {
    return fallback;
  }
}

function writeStoredBoolean(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* Private browsing/quota failures should not break the shell controls. */
  }
}

function getPageTitle(pathname: string): string {
  return getFeatureByPath(pathname)?.title ?? "Not found";
}

export function AppShellLayout() {
  const [navCollapsed, setNavCollapsed] = useState(() =>
    readStoredBoolean(NAV_STORAGE_KEY, false),
  );
  const [aiCollapsed, setAiCollapsed] = useState(() =>
    readStoredBoolean(AI_STORAGE_KEY, false),
  );
  const location = useLocation();
  const title = getPageTitle(location.pathname);

  const onToggleNav = useCallback(() => {
    setNavCollapsed((prev) => {
      const next = !prev;
      writeStoredBoolean(NAV_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const onToggleAi = useCallback(() => {
    setAiCollapsed((prev) => {
      const next = !prev;
      writeStoredBoolean(AI_STORAGE_KEY, next);
      return next;
    });
  }, []);

  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`;
  }, [title]);

  return (
    <AppShell
      navCollapsed={navCollapsed}
      onToggleNav={onToggleNav}
      aiCollapsed={aiCollapsed}
      onToggleAi={onToggleAi}
      title={title}
    >
      <Suspense
        fallback={
          <div className="rect-panel__fallback" role="status">
            Loading…
          </div>
        }
      >
        <Outlet />
      </Suspense>
    </AppShell>
  );
}
