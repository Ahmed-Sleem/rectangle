import { RouterProvider } from "react-router-dom";
import { AppReadyGate } from "./AppReadyGate";
import { AppProviders } from "./providers";
import { createAppRouter } from "./router";

const router = createAppRouter();

export default function App() {
  return (
    <AppReadyGate>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </AppReadyGate>
  );
}
