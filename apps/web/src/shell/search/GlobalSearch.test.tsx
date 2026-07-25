/** Tests the global search palette: keyboard, states, and navigation. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import { GlobalSearch } from "./GlobalSearch";

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>;
}

function renderSearch(onClose = () => undefined) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RectangleI18nProvider>
        <MemoryRouter initialEntries={["/"]}>
          <GlobalSearch open onClose={onClose} />
          <Routes>
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </RectangleI18nProvider>
    </QueryClientProvider>,
  );
}

const results = {
  results: [
    { kind: "project", id: "p1", title: "New Cairo Tower", subtitle: "NCT-01", href: "/projects/p1" },
    { kind: "task", id: "t1", title: "Pour raft foundation", subtitle: "New Cairo Tower", href: "/tasks?projectId=p1" },
  ],
};

describe("GlobalSearch", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await setRectangleLanguage("en");
  });

  it("asks for more characters before searching", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse(results));
    const user = userEvent.setup();
    renderSearch();

    expect(screen.getByText("Type at least two characters.")).toBeInTheDocument();
    await user.type(screen.getByRole("combobox"), "a");

    // One character is not worth a round trip.
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  it("shows results and says what kind each one is", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse(results));
    const user = userEvent.setup();
    renderSearch();

    await user.type(screen.getByRole("combobox"), "cairo");

    const list = await screen.findByRole("listbox");
    const options = within(list).getAllByRole("option");
    expect(options).toHaveLength(2);
    // Each row names the kind of record, so a project and a task sharing a
    // name are told apart.
    expect(within(options[0]!).getByText("Project")).toBeInTheDocument();
    expect(within(options[1]!).getByText("Task")).toBeInTheDocument();
    expect(within(options[1]!).getByText("Pour raft foundation")).toBeInTheDocument();
  });

  it("moves the highlight with the arrow keys and opens with Enter", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse(results));
    const user = userEvent.setup();
    renderSearch();

    await user.type(screen.getByRole("combobox"), "cairo");
    await screen.findByRole("listbox");

    await user.keyboard("{ArrowDown}");
    const options = screen.getAllByRole("option");
    expect(options[1]).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/tasks?projectId=p1"),
    );
  });

  it("closes when a result is chosen", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse(results));
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderSearch(onClose);

    await user.type(screen.getByRole("combobox"), "cairo");
    const list = await screen.findByRole("listbox");
    await user.click(within(list).getAllByRole("option")[0]!);

    expect(onClose).toHaveBeenCalled();
  });

  it("says so when nothing matches", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse({ results: [] }));
    const user = userEvent.setup();
    renderSearch();

    await user.type(screen.getByRole("combobox"), "zzzz");
    expect(await screen.findByText("Nothing matches that search.")).toBeInTheDocument();
  });

  it("reports a failed search instead of pretending there are no results", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      jsonResponse({ error: { code: "INTERNAL", message: "boom" } }, 500),
    );
    const user = userEvent.setup();
    renderSearch();

    await user.type(screen.getByRole("combobox"), "cairo");
    expect(await screen.findByRole("alert")).toHaveTextContent("Search could not be completed.");
  });
});
