import { createBrowserRouter } from "react-router-dom";
import { ProtectedShellRoute, LoginRoute, SetupRoute } from "./AuthRoutes";
import { RouteError } from "./RouteError";
import { getEnabledFeatures } from "@/shell/registry";
import NotFound from "./NotFound";
import SetupPage from "@/features/setup/SetupPage";
import LoginPage from "@/features/login/LoginPage";
import AcceptInvitationPage from "@/features/auth-lifecycle/AcceptInvitationPage";
import PasswordResetPage from "@/features/auth-lifecycle/PasswordResetPage";
import PasswordResetConfirmPage from "@/features/auth-lifecycle/PasswordResetConfirmPage";
import EmailChangePage from "@/features/auth-lifecycle/EmailChangePage";
import ProjectDetailPage from "@/features/projects/ProjectDetailPage";
import ProjectSettingsPage from "@/features/projects/ProjectSettingsPage";

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
    // Reached from links in email by people with no session, and by people
    // whose session must not decide the outcome. They sit outside both the
    // shell and the login guard: a signed-in visitor following an invitation
    // for a different account still needs the page to work.
    {
      path: "/invite/accept",
      element: <AcceptInvitationPage />,
      errorElement: <RouteError />,
    },
    {
      path: "/reset",
      element: <PasswordResetPage />,
      errorElement: <RouteError />,
    },
    {
      path: "/reset/confirm",
      element: <PasswordResetConfirmPage />,
      errorElement: <RouteError />,
    },
    {
      path: "/email-change/confirm",
      element: <EmailChangePage mode="confirm" />,
      errorElement: <RouteError />,
    },
    {
      path: "/email-change/revert",
      element: <EmailChangePage mode="revert" />,
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
          path: "projects/:projectId/settings",
          element: <ProjectSettingsPage />,
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
