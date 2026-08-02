/** Tests login form submits real auth request. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RectangleI18nProvider } from "@/shared/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/shared/auth";
import { MemoryRouter } from "react-router";
import LoginPage from "./LoginPage";
/** The backdrop lives in pseudo-elements, so the sheet is the only witness. */
import globalCss from "@/shared/styles/global.css?raw";

function renderLogin() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  // The page links to password reset, so it needs a router to render.
  return render(
    <RectangleI18nProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthProvider>
            <LoginPage />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </RectangleI18nProvider>,
  );
}

describe("LoginPage", () => {
  it("submits email and password credentials", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify({ setupRequired: false }), { status: 200, headers: { "Content-Type": "application/json" } })))
      .mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }), { status: 401, headers: { "Content-Type": "application/json" } })))
      .mockImplementationOnce((_input, init) => {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toMatchObject({ email: "owner@rectangle.test" });
        expect(JSON.parse(String(init?.body))).not.toHaveProperty("tenantSlug");
        return Promise.resolve(new Response(JSON.stringify({ user: { tenantId: "1", userId: "2", roles: ["owner"] } }), { status: 200, headers: { "Content-Type": "application/json" } }));
      })
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ user: { tenantId: "1", userId: "2", roles: ["owner"] } }), { status: 200, headers: { "Content-Type": "application/json" } })));

    renderLogin();
    await user.type(screen.getByLabelText(/Email/i), "owner@rectangle.test");
    await user.type(screen.getByLabelText(/Password/i), "VeryStrongPassword123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/v1/auth/login", expect.objectContaining({ method: "POST" })));
  });

  it("offers a way to recover a forgotten password", () => {
    renderLogin();
    // Without this the reset flow exists but nobody can reach it.
    expect(screen.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute("href", "/reset");
  });
});

/**
 * The backdrop behind every pre-login page.
 *
 * Asserted against the stylesheet rather than a rendered pixel: it is drawn
 * entirely in `::before`/`::after`, which jsdom does not compute, and a
 * screenshot test would fail on font rendering long before it caught a
 * regression here. What must hold is the contract — a grid, drifting, on
 * tokens, and stopping for anyone who asks for reduced motion.
 */
describe("the sign-in backdrop", () => {
  const authCss = globalCss.slice(globalCss.indexOf(".rect-auth-screen {"));

  it("draws a drafting grid rather than leaving the screen bare", () => {
    expect(authCss).toMatch(/\.rect-auth-screen::before/u);
    expect(authCss).toMatch(/--rect-auth-grid-line/u);
    expect(authCss).toMatch(/--rect-auth-grid-major/u);
  });

  it("drifts, and only by transform so the form never repaints", () => {
    /*
     * Animating anything else would repaint the card on every frame of a
     * permanent animation, on the one screen a person stares at while typing.
     */
    expect(authCss).toMatch(/animation: rect-auth-drift/u);
    expect(globalCss).toMatch(/@keyframes rect-auth-drift[\s\S]*?transform: translate3d/u);
    const keyframes = globalCss.slice(globalCss.indexOf("@keyframes rect-auth-drift"));
    const block = keyframes.slice(0, keyframes.indexOf("\n}"));
    expect(block).not.toMatch(/\b(left|top|margin|width|height|background-position)\s*:/u);
  });

  it("takes every value from the theme, so one file still controls the look", () => {
    // The whole point of the token layer: no literal colours here.
    const beforeBlock = authCss.slice(
      authCss.indexOf(".rect-auth-screen::before"),
      authCss.indexOf(".rect-auth-screen::after"),
    );
    expect(beforeBlock).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
    expect(beforeBlock).not.toMatch(/rgba?\(/u);
  });

  it("stops moving for anyone who asks for reduced motion", () => {
    // Mandatory for every animation in the product, and this one runs forever.
    const reduced = globalCss.slice(globalCss.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.rect-auth-screen::before/u);
    expect(reduced).toMatch(/animation: none/u);
  });
});
