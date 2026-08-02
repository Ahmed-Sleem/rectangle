/**
 * Displays a short boot screen while the app reaches a stable first paint.
 * The minimum duration avoids a glitchy flash; the maximum duration guarantees
 * the UI never appears frozen if a readiness signal hangs.
 */
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { BootScreen } from "./BootScreen";

const DEFAULT_MIN_MS = 1100;
const DEFAULT_MAX_MS = 2200;

function waitForDocumentReady(): Promise<void> {
  if (typeof document === "undefined" || document.readyState !== "loading") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
  });
}

function waitForAnimationFrame(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function waitForFonts(): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return Promise.resolve();
  return document.fonts.ready.then(() => undefined).catch(() => undefined);
}

async function defaultReadyCheck(): Promise<void> {
  await Promise.all([waitForDocumentReady(), waitForFonts(), waitForAnimationFrame()]);
}

export interface AppReadyGateProps {
  children: ReactNode;
  minMs?: number;
  maxMs?: number;
  readyCheck?: () => Promise<void>;
}

export function AppReadyGate({
  children,
  minMs = DEFAULT_MIN_MS,
  maxMs = DEFAULT_MAX_MS,
  readyCheck = defaultReadyCheck,
}: AppReadyGateProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const safeMinMs = Math.max(0, minMs);
    const safeMaxMs = Math.max(safeMinMs, maxMs);

    const minWait = new Promise<void>((resolve) => {
      window.setTimeout(resolve, safeMinMs);
    });

    const maxTimer = window.setTimeout(() => {
      if (!cancelled) setVisible(false);
    }, safeMaxMs);

    void Promise.all([minWait, readyCheck().catch(() => undefined)]).then(() => {
      if (!cancelled) {
        window.clearTimeout(maxTimer);
        setVisible(false);
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(maxTimer);
    };
  }, [maxMs, minMs, readyCheck]);

  return (
    <>
      {children}
      {visible ? <BootScreen label="Loading Rectangle" /> : null}
    </>
  );
}
