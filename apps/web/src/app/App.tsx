import { RouterProvider } from "react-router/dom";
import { useKeyboardInset } from "@/shared/lib/useKeyboardInset";
import { AppReadyGate } from "./AppReadyGate";
import { AppProviders } from "./providers";
import { createAppRouter } from "./router";

const router = createAppRouter();

export default function App() {
  /*
   * Installed once, here, rather than by each surface that cares. How much of
   * the screen the keyboard is covering is a fact about the window, not about
   * any one dialog, and a single listener publishing a single custom property
   * is both cheaper and impossible to get inconsistently wrong.
   */
  useKeyboardInset();

  return (
    <AppReadyGate>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </AppReadyGate>
  );
}
