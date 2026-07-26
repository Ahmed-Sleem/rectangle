/**
 * The progress bar is one shared component used by the project cards, the
 * project table, and the project workspace. These tests pin the behaviour all
 * three depend on, so a change to the component cannot quietly alter them.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./page-blocks";

describe("ProgressBar", () => {
  it("reports completion as a percentage and as counts", () => {
    render(<ProgressBar done={3} total={12} label="Work on Tower" />);
    expect(screen.getByText("25%")).toBeInTheDocument();
    // The denominator matters: "25%" alone hides 1/4 versus 25/100.
    expect(screen.getByText("3/12")).toBeInTheDocument();
  });

  it("exposes the real numbers to assistive technology", () => {
    render(<ProgressBar done={3} total={12} label="Work on Tower" />);
    const bar = screen.getByRole("progressbar", { name: "Work on Tower" });
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuemax", "12");
    expect(bar).toHaveAttribute("aria-valuetext", "25%");
  });

  it("draws a visible sliver for progress that would otherwise round away", () => {
    const { container } = render(<ProgressBar done={1} total={200} label="Work" />);
    // Half a percent is too thin to see; without a floor it looks like none.
    expect(container.querySelector(".rect-progress__fill--started")).not.toBeNull();
  });

  it("draws nothing when no work is done, so zero stays distinguishable", () => {
    const { container } = render(<ProgressBar done={0} total={12} label="Work" />);
    expect(container.querySelector(".rect-progress__fill--started")).toBeNull();
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("marks completion, because a finished project should not look like any other", () => {
    const { container } = render(<ProgressBar done={12} total={12} label="Work" />);
    expect(container.querySelector(".rect-progress__fill--complete")).not.toBeNull();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("omits the counts where a dense cell has no room for them", () => {
    render(<ProgressBar done={3} total={12} label="Work" showCounts={false} />);
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.queryByText("3/12")).not.toBeInTheDocument();
  });
});
