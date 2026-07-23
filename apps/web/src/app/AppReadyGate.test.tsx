/** Tests the app boot gate minimum and maximum timing guarantees. */
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppReadyGate } from "./AppReadyGate";

describe("AppReadyGate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the loading screen for the minimum duration", async () => {
    render(
      <AppReadyGate readyCheck={() => Promise.resolve()}>
        <div>Application content</div>
      </AppReadyGate>,
    );

    expect(screen.getByRole("status", { name: "Loading Rectangle" })).toBeInTheDocument();
    expect(screen.getByText("Application content")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1099);
    });
    expect(screen.getByRole("status", { name: "Loading Rectangle" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(screen.queryByRole("status", { name: "Loading Rectangle" })).not.toBeInTheDocument();
  });

  it("hides at max duration if readiness hangs", async () => {
    render(
      <AppReadyGate minMs={100} maxMs={400} readyCheck={() => new Promise(() => undefined)}>
        <div>Application content</div>
      </AppReadyGate>,
    );

    expect(screen.getByRole("status", { name: "Loading Rectangle" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(screen.queryByRole("status", { name: "Loading Rectangle" })).not.toBeInTheDocument();
  });
});
