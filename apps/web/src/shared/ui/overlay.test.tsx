/**
 * The window system is used by every feature, so its behaviour is pinned here:
 * portalling, sizing, focus handling, dismissal, scroll lock and app blur.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { RectangleI18nProvider } from "@/shared/i18n";
import { ConfirmDialog, FormDialog, Overlay } from "./overlay";
import { __getOverlayCounters } from "./overlay-behaviour";
import { Button, Field, Input } from "./primitives";
import overlayCss from "./ui.css?raw";

function withI18n(ui: React.ReactNode) {
  return <RectangleI18nProvider>{ui}</RectangleI18nProvider>;
}

function Harness({ dismissOnBackdrop = true }: { dismissOnBackdrop?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rect-app">
      <button type="button" onClick={() => setOpen(true)}>
        Open window
      </button>
      <Overlay
        open={open}
        title="Create project"
        description="Register a project."
        onClose={() => setOpen(false)}
        dismissOnBackdrop={dismissOnBackdrop}
        footer={<Button variant="primary">Save</Button>}
      >
        <Field label="Project name">
          <Input aria-label="Project name" />
        </Field>
      </Overlay>
    </div>
  );
}

describe("Overlay", () => {
  it("renders outside the app subtree so the canvas transform cannot trap it", async () => {
    const user = userEvent.setup();
    const { container } = render(withI18n(<Harness />));

    await user.click(screen.getByRole("button", { name: "Open window" }));

    const dialog = screen.getByRole("dialog", { name: "Create project" });
    expect(dialog).toBeInTheDocument();
    // The canvas creates a containing block, so an in-tree overlay would be
    // clipped to it. Portalling to <body> is what keeps it covering the app.
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it("describes itself to assistive technology", async () => {
    const user = userEvent.setup();
    render(withI18n(<Harness />));
    await user.click(screen.getByRole("button", { name: "Open window" }));

    const dialog = screen.getByRole("dialog", { name: "Create project" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("Register a project.");
  });

  it("moves focus into the window and restores it to the trigger on close", async () => {
    const user = userEvent.setup();
    render(withI18n(<Harness />));

    const trigger = screen.getByRole("button", { name: "Open window" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Create project" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    await user.keyboard("{Escape}");

    // The window stays mounted briefly so its exit animation can play, but focus
    // returns to the trigger immediately so the keyboard is never stranded.
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps Tab focus inside the open window", async () => {
    const user = userEvent.setup();
    render(withI18n(<Harness />));
    await user.click(screen.getByRole("button", { name: "Open window" }));

    const dialog = screen.getByRole("dialog", { name: "Create project" });

    for (let step = 0; step < 8; step += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("locks background scrolling and blurs the app while open, then restores both", async () => {
    const user = userEvent.setup();
    render(withI18n(<Harness />));

    expect(document.documentElement).not.toHaveClass("rect-has-overlay");

    await user.click(screen.getByRole("button", { name: "Open window" }));

    expect(document.body.style.overflow).toBe("hidden");
    // The blur is applied at the document root so the whole shell is affected,
    // not just the container the window happens to sit in.
    expect(document.documentElement).toHaveClass("rect-has-overlay");

    await user.keyboard("{Escape}");

    await waitFor(() => expect(document.documentElement).not.toHaveClass("rect-has-overlay"));
    expect(document.body.style.overflow).toBe("");
    expect(__getOverlayCounters()).toEqual({ scrollLockCount: 0, blurCount: 0 });
  });

  it("closes on a backdrop press but never on a press that began inside", async () => {
    const user = userEvent.setup();
    render(withI18n(<Harness />));
    await user.click(screen.getByRole("button", { name: "Open window" }));

    // A press starting on the surface must not dismiss, even if it ends elsewhere.
    await user.click(screen.getByRole("dialog", { name: "Create project" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByTestId("overlay-backdrop"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("plays an exit animation before leaving the tree", async () => {
    const user = userEvent.setup();
    render(withI18n(<Harness />));
    await user.click(screen.getByRole("button", { name: "Open window" }));

    const backdrop = screen.getByTestId("overlay-backdrop");
    expect(backdrop).toHaveAttribute("data-state", "open");

    await user.keyboard("{Escape}");

    // Still present, now marked closed so CSS can animate it out. State drives
    // both directions, so the animation name changes rather than a class
    // toggling on the same animation.
    const closing = screen.getByTestId("overlay-backdrop");
    expect(closing).toHaveAttribute("data-state", "closed");
    expect(screen.getByRole("dialog")).toHaveAttribute("data-state", "closed");

    // CSS owns the duration; the animation end event completes the unmount.
    fireEvent.animationEnd(closing);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("ignores a backdrop press once the window is closing", async () => {
    const user = userEvent.setup();
    render(withI18n(<Harness />));
    await user.click(screen.getByRole("button", { name: "Open window" }));
    await user.keyboard("{Escape}");

    const closing = screen.getByTestId("overlay-backdrop");
    fireEvent.mouseDown(closing);

    // A press during the exit must not restart or re-trigger anything.
    expect(closing).toHaveAttribute("data-state", "closed");
  });

  it("keeps the page dimmed and locked until the window has actually gone", async () => {
    const user = userEvent.setup();
    render(withI18n(<Harness />));
    await user.click(screen.getByRole("button", { name: "Open window" }));

    await user.keyboard("{Escape}");

    // Releasing these when `open` flips would restore the page while the window
    // is still on screen, which is what made the close look broken.
    expect(document.documentElement).toHaveClass("rect-has-overlay");
    expect(document.body.style.overflow).toBe("hidden");

    // Held for the whole exit, not released the instant `open` flipped.
    expect(__getOverlayCounters()).toEqual({ scrollLockCount: 1, blurCount: 1 });

    fireEvent.animationEnd(screen.getByTestId("overlay-backdrop"));

    await waitFor(() => expect(document.documentElement).not.toHaveClass("rect-has-overlay"));
    expect(document.body.style.overflow).toBe("");
  });

  it("returns to the open state cleanly when reopened mid-exit", async () => {
    const user = userEvent.setup();
    render(withI18n(<Harness />));
    const trigger = screen.getByRole("button", { name: "Open window" });

    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.getByTestId("overlay-backdrop")).toHaveAttribute("data-state", "closed");

    // Reopening must not leave the window stuck in its exited appearance.
    await user.click(trigger);
    expect(screen.getByTestId("overlay-backdrop")).toHaveAttribute("data-state", "open");
    expect(screen.getByRole("dialog")).toHaveAttribute("data-state", "open");
  });

  it("can opt out of backdrop dismissal for flows where loss is costly", async () => {
    const user = userEvent.setup();
    render(withI18n(<Harness dismissOnBackdrop={false} />));
    await user.click(screen.getByRole("button", { name: "Open window" }));

    await user.click(screen.getByTestId("overlay-backdrop"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("Overlay sizing", () => {
  it("caps the surface against the viewport before its width ceiling", () => {
    const surface = overlayCss.slice(
      overlayCss.indexOf(".rect-overlay__surface {"),
      overlayCss.indexOf(".rect-overlay__surface--sm"),
    );

    // dvh, not vh, so mobile browser chrome cannot push the window off-screen.
    expect(surface).toContain("100dvh");
    expect(surface).toContain("max-block-size");
    // Without min-height:0 the flex body refuses to shrink and the window grows
    // past the screen. This is the exact bug the sizing rules exist to prevent.
    expect(surface).toContain("min-height: 0");
  });

  it("scrolls only the body so header and footer actions can never be clipped", () => {
    const body = overlayCss.slice(
      overlayCss.indexOf(".rect-overlay__body {"),
      overlayCss.indexOf(".rect-overlay__footer {"),
    );
    expect(body).toContain("overflow-y: auto");
    expect(body).toContain("min-height: 0");

    const footer = overlayCss.slice(
      overlayCss.indexOf(".rect-overlay__footer {"),
      overlayCss.indexOf(".rect-overlay__form {"),
    );
    expect(footer).toContain("flex-shrink: 0");
  });

  it("blurs the shell rather than dimming only the inner container", () => {
    expect(overlayCss).toContain(".rect-has-overlay .rect-app");
    expect(overlayCss).toContain("filter: blur(var(--rect-app-blur))");
    expect(overlayCss).toContain("backdrop-filter: blur(var(--rect-overlay-blur))");
  });
});

describe("FormDialog", () => {
  it("submits from a footer action that lives outside the scroll area", async () => {
    const user = userEvent.setup();
    let submitted = 0;

    render(
      withI18n(
        <FormDialog
          open
          title="Create user"
          onClose={() => undefined}
          onSubmit={(event) => {
            event.preventDefault();
            submitted += 1;
          }}
          submitLabel="Create user"
        >
          <Field label="Name">
            <Input aria-label="Name" />
          </Field>
        </FormDialog>,
      ),
    );

    const submit = screen.getByRole("button", { name: "Create user" });
    // The button is in the footer, but drives the form in the scrolling body.
    expect(submit.closest(".rect-overlay__footer")).not.toBeNull();

    await user.click(submit);
    expect(submitted).toBe(1);
  });

  it("shows a pending state and blocks repeat submission", () => {
    render(
      withI18n(
        <FormDialog
          open
          title="Create user"
          onClose={() => undefined}
          onSubmit={() => undefined}
          submitLabel="Create user"
          pending
        >
          <span>Fields</span>
        </FormDialog>,
      ),
    );

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("surfaces a failure message as an alert", () => {
    render(
      withI18n(
        <FormDialog
          open
          title="Create user"
          onClose={() => undefined}
          onSubmit={() => undefined}
          submitLabel="Create user"
          error="That email address is already in use."
        >
          <span>Fields</span>
        </FormDialog>,
      ),
    );

    expect(screen.getByRole("alert")).toHaveTextContent("That email address is already in use.");
  });
});

describe("ConfirmDialog", () => {
  it("confirms and cancels through shared footer actions", async () => {
    const user = userEvent.setup();
    let confirmed = 0;
    let closed = 0;

    render(
      withI18n(
        <ConfirmDialog
          open
          title="Remove member"
          onClose={() => {
            closed += 1;
          }}
          onConfirm={() => {
            confirmed += 1;
          }}
          tone="danger"
          confirmLabel="Remove"
        >
          This person will lose access.
        </ConfirmDialog>,
      ),
    );

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(confirmed).toBe(1);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(closed).toBe(1);
  });
});
