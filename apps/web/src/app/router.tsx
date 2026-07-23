import { createBrowserRouter } from "react-router-dom";
import { ProtectedShellRoute, LoginRoute, SetupRoute } from "./AuthRoutes";
import { RouteError } from "./RouteError";
import { getEnabledFeatures } from "@/shell/registry";
import NotFound from "./NotFound";
import SetupPage from "@/features/setup/SetupPage";
import LoginPage from "@/features/login/LoginPage";
import ProjectDetailPage from "@/features/projects/ProjectDetailPage";

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
      path: "/setup",
      element: <SetupRoute><SetupPage /></SetupRoute>,
      errorElement: <RouteError />,
    },
    {
      path: "/login",
      element: <LoginRoute><LoginPage /></LoginRoute>,
      errorElement: <RouteError />,
    },
    {
      path: "/",
      element: <ProtectedShellRoute />,
      errorElement: <RouteError />,
      children: [
        ...buildChildren(),
        {
          path: "projects/:projectId",
          element: <ProjectDetailPage />,
          errorElement: <RouteError />,
        },
        {
          path: "*",
          element: <NotFound />,
        },
      ],
    },
  ]);
}
