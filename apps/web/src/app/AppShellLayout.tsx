import { Suspense, useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AppShell } from "@/shell/AppShell";
import { getFeatureByPath } from "@/shell/registry";

const STORAGE_KEY = "rectangle.shell.collapsed";

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

  const title = feature?.title ?? "Not found";
  const badge = feature?.title ?? "Rectangle";

  const onToggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsed(next);
      return next;
    });
  }, []);

  useEffect(() => {
    document.title = feature
      ? `${feature.title} — Rectangle`
      : "Not found — Rectangle";
  }, [feature]);

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
