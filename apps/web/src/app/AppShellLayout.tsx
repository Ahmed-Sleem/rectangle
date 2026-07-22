import { Suspense, useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AppShell } from "@/shell/AppShell";
import { getFeatureByPath } from "@/shell/registry";

const STORAGE_KEY = "rectangle.shell.collapsed";
const PAGE_TITLE = "RECTANGLE";

function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

export function AppShellLayout() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const location = useLocation();
  const feature = getFeatureByPath(location.pathname);

  /** Panel brand title is always RECTANGLE; badge shows active module. */
  const title = PAGE_TITLE;
  const badge = feature?.title ?? "Home";

  const onToggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsed(next);
      return next;
    });
  }, []);

  useEffect(() => {
    document.title = PAGE_TITLE;
  }, [location.pathname]);

  return (
    <AppShell
      collapsed={collapsed}
      onToggle={onToggle}
      title={title}
      badge={badge}
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
