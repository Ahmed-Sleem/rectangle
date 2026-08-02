/**
 * Holds the boot screen after signing in until the workspace is actually ready.
 *
 * Signing in used to hand over a shell that was still assembling itself: the
 * chrome appeared, then the page's own spinner, then figures arriving one panel
 * at a time. Every one of those steps is honest, and together they read as a
 * product that is not finished loading — which is exactly what the owner
 * described. The app should open once, complete.
 *
 * The children are rendered underneath from the first moment, deliberately.
 * Nothing would ever load if the gate waited before mounting the page: it is
 * the page mounting that starts its queries. So the shell is built behind the
 * boot screen and revealed when there is nothing left in flight — the same
 * arrangement `AppReadyGate` uses for the browser's first paint, and the same
 * screen, so the two waits look like one idea rather than two.
 *
 * This gate runs once per entry into the workspace, not on every navigation.
 * Covering each route change would turn a fast, quiet transition into a
 * full-screen interruption, which is a worse product than the one being fixed.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useIsFetching } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BootScreen } from "./BootScreen";

/**
 * The longest the workspace may be held back.
 *
 * A ceiling, never a target. If a request hangs — a slow report, an endpoint
 * having a bad day — the person still gets their workspace, with whichever
 * panel is still waiting showing its own loading state. A gate with no ceiling
 * turns one slow query into an application that never opens.
 */
const MAX_WAIT_MS = 4000;

/**
 * How long the workspace must be quiet before it counts as settled.
 *
 * Queries do not all start on the same tick: the shell mounts, the page mounts,
 * and a panel may ask for something only once its parent's data arrives. A
 * single observation of "nothing in flight" would catch the gap between two of
 * those and open the gate onto a page about to start loading again. Two frames
 * of quiet is enough to tell a real finish from a gap between requests.
 */
const QUIET_MS = 120;

export function WorkspaceReadyGate({
  children,
  maxWaitMs = MAX_WAIT_MS,
  quietMs = QUIET_MS,
}: {
  children: ReactNode;
  maxWaitMs?: number;
  quietMs?: number;
}) {
  const { t } = useTranslation();
  const inFlight = useIsFetching();
  const [ready, setReady] = useState(false);
  /*
   * Once open, it stays open. Without this the gate would slam shut again the
   * moment any later query ran — a refresh, a filter, a background refetch —
   * and the person would lose their screen to a boot animation while working.
   */
  const openedRef = useRef(false);

  // The ceiling runs from mount, independently of anything the queries do.
  useEffect(() => {
    if (openedRef.current) return;
    const timer = window.setTimeout(() => {
      openedRef.current = true;
      setReady(true);
    }, maxWaitMs);
    return () => window.clearTimeout(timer);
  }, [maxWaitMs]);

  useEffect(() => {
    if (openedRef.current) return;
    if (inFlight > 0) return;

    const timer = window.setTimeout(() => {
      openedRef.current = true;
      setReady(true);
    }, quietMs);
    // Cleared if anything starts fetching within the quiet window, which is
    // what makes this "settled" rather than "momentarily idle".
    return () => window.clearTimeout(timer);
  }, [inFlight, quietMs]);

  return (
    <>
      {children}
      {ready ? null : <BootScreen label={t("common.preparingWorkspace")} />}
    </>
  );
}
