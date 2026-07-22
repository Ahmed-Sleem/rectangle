import { createBrowserRouter } from "react-router-dom";
import { AppShellLayout } from "./AppShellLayout";
import { RouteError } from "./RouteError";
import { getEnabledFeatures } from "@/shell/registry";
import NotFound from "./NotFound";

function buildChildren() {
  const features = getEnabledFeatures();

  return features.map((feature) => {
    if (feature.routePath === "/") {
      return {
        index: true as const,
        lazy: async () => {
          const mod = await feature.load();
          return { Component: mod.default };
        },
        errorElement: <RouteError />,
      };
    }

    const path = feature.routePath.replace(/^\//, "");

    return {
      path,
      lazy: async () => {
        const mod = await feature.load();
        return { Component: mod.default };
      },
      errorElement: <RouteError />,
    };
  });
}

export function createAppRouter() {
  return createBrowserRouter([
    {
      path: "/",
      element: <AppShellLayout />,
      errorElement: <RouteError />,
      children: [
        ...buildChildren(),
        {
          path: "*",
          element: <NotFound />,
        },
      ],
    },
  ]);
}
