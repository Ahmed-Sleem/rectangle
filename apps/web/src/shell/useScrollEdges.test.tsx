import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useScrollEdges } from "./useScrollEdges";

function Probe() {
  const { ref, edges } = useScrollEdges<HTMLDivElement>();
  return (
    <div
      ref={ref}
      data-testid="scroller"
      data-scroll-top={edges.atTop ? "true" : "false"}
      data-scroll-bottom={edges.atBottom ? "true" : "false"}
      data-overflowing={edges.overflowing ? "true" : "false"}
    />
  );
}

/** jsdom reports zero layout, so drive the geometry explicitly. */
function setGeometry(
  node: HTMLElement,
  { scrollTop, scrollHeight, clientHeight }: Record<string, number>,
) {
  Object.defineProperty(node, "scrollHeight", { value: scrollHeight, configurable: true });
  Object.defineProperty(node, "clientHeight", { value: clientHeight, configurable: true });
  Object.defineProperty(node, "scrollTop", { value: scrollTop, writable: true, configurable: true });
}

async function scrollTo(node: HTMLElement, geometry: Record<string, number>) {
  setGeometry(node, geometry);
  await act(async () => {
    node.dispatchEvent(new Event("scroll"));
  });
}

describe("useScrollEdges", () => {
  it("reports no overflow when the content fits", async () => {
    render(<Probe />);
    const node = screen.getByTestId("scroller");

    await scrollTo(node, { scrollTop: 0, scrollHeight: 300, clientHeight: 300 });

    expect(node).toHaveAttribute("data-overflowing", "false");
    // Nothing is hidden, so neither edge may be faded.
    expect(node).toHaveAttribute("data-scroll-top", "true");
    expect(node).toHaveAttribute("data-scroll-bottom", "true");
  });

  it("marks only the bottom edge when resting at the top of longer content", async () => {
    render(<Probe />);
    const node = screen.getByTestId("scroller");

    await scrollTo(node, { scrollTop: 0, scrollHeight: 900, clientHeight: 300 });

    expect(node).toHaveAttribute("data-overflowing", "true");
    expect(node).toHaveAttribute("data-scroll-top", "true");
    expect(node).toHaveAttribute("data-scroll-bottom", "false");
  });

  it("marks both edges while scrolled through the middle", async () => {
    render(<Probe />);
    const node = screen.getByTestId("scroller");

    await scrollTo(node, { scrollTop: 300, scrollHeight: 900, clientHeight: 300 });

    expect(node).toHaveAttribute("data-scroll-top", "false");
    expect(node).toHaveAttribute("data-scroll-bottom", "false");
  });

  it("marks only the top edge once scrolled to the end", async () => {
    render(<Probe />);
    const node = screen.getByTestId("scroller");

    await scrollTo(node, { scrollTop: 600, scrollHeight: 900, clientHeight: 300 });

    expect(node).toHaveAttribute("data-scroll-top", "false");
    expect(node).toHaveAttribute("data-scroll-bottom", "true");
  });

  it("tolerates sub-pixel scroll offsets at the end of the range", async () => {
    render(<Probe />);
    const node = screen.getByTestId("scroller");

    await scrollTo(node, { scrollTop: 599.4, scrollHeight: 900, clientHeight: 300 });

    expect(node).toHaveAttribute("data-scroll-bottom", "true");
  });
});
