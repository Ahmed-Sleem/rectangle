/** Tests the centralised notification stack: semantics, timing, stacking. */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import { ToastProvider } from "./ToastProvider";
import { useToast } from "./useToast";

let api: ReturnType<typeof useToast> | null = null;

function Harness() {
  const toast = useToast();
  // Captured so timing tests can raise a toast without userEvent, which does
  // not co-operate with fake timers.
  api = toast;
  return (
    <>
      <button type="button" onClick={() => toast.success("Saved")}>
        good
      </button>
      <button type="button" onClick={() => toast.error("Failed")}>
        bad
      </button>
      <button type="button" onClick={() => toast.info("Note", { description: "Extra detail" })}>
        detail
      </button>
    </>
  );
}

function renderToasts() {
  return render(
    <RectangleI18nProvider>
      <ToastProvider>
        <Harness />
      </ToastProvider>
    </RectangleI18nProvider>,
  );
}

describe("ToastProvider", () => {
  beforeEach(async () => {
    await setRectangleLanguage("en");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mounts the live region before any message exists", () => {
    renderToasts();
    // A region created at the same moment as its content is never announced,
    // so it has to be present from the start.
    expect(screen.getByRole("region", { name: "Notifications" })).toBeInTheDocument();
  });

  it("shows a confirmation politely", async () => {
    const user = userEvent.setup();
    renderToasts();

    await user.click(screen.getByRole("button", { name: "good" }));

    const toast = await screen.findByRole("status");
    expect(within(toast).getByText("Saved")).toBeInTheDocument();
    expect(toast).toHaveAttribute("aria-live", "polite");
    expect(toast).toHaveAttribute("aria-atomic", "true");
  });

  it("interrupts for an error", async () => {
    const user = userEvent.setup();
    renderToasts();

    await user.click(screen.getByRole("button", { name: "bad" }));

    // Errors are the one case worth cutting across what is being read.
    const toast = await screen.findByRole("alert");
    expect(toast).toHaveAttribute("aria-live", "assertive");
  });

  it("carries an optional second line", async () => {
    const user = userEvent.setup();
    renderToasts();

    await user.click(screen.getByRole("button", { name: "detail" }));

    expect(await screen.findByText("Extra detail")).toBeInTheDocument();
  });

  it("stacks several messages", async () => {
    const user = userEvent.setup();
    renderToasts();

    await user.click(screen.getByRole("button", { name: "good" }));
    await user.click(screen.getByRole("button", { name: "detail" }));

    const region = screen.getByRole("region", { name: "Notifications" });
    await waitFor(() => expect(within(region).getAllByText(/Saved|Note/u).length).toBe(2));
  });

  it("keeps only the newest few so the corner stays readable", async () => {
    const user = userEvent.setup();
    renderToasts();

    for (let index = 0; index < 5; index += 1) {
      await user.click(screen.getByRole("button", { name: "good" }));
    }

    const region = screen.getByRole("region", { name: "Notifications" });
    expect(within(region).getAllByText("Saved").length).toBe(3);
  });

  it("can be dismissed by hand", async () => {
    const user = userEvent.setup();
    renderToasts();

    await user.click(screen.getByRole("button", { name: "good" }));
    await screen.findByText("Saved");
    await user.click(screen.getByRole("button", { name: "Dismiss notification" }));

    await waitFor(() => expect(screen.queryByText("Saved")).not.toBeInTheDocument());
  });

  it("leaves on its own, but not before the accessibility floor", async () => {
    vi.useFakeTimers();
    renderToasts();

    act(() => void api!.success("Saved"));
    expect(screen.getByText("Saved")).toBeInTheDocument();

    // Four seconds is below the five-second floor: a magnifier user would not
    // have reached it yet, so it must still be on screen.
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByText("Saved")).toBeInTheDocument();

    // Past the floor, plus the exit animation.
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("holds the message while the pointer is on the stack", async () => {
    vi.useFakeTimers();
    renderToasts();

    act(() => void api!.success("Saved"));
    const region = screen.getByRole("region", { name: "Notifications" });
    act(() => void fireEvent.mouseEnter(region));

    // Well past the timeout: hovering must suspend it, or a message being
    // read disappears mid-sentence.
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });
});
