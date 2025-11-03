import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
} from "react-router-dom";

import { ErrorBoundary, RouteErrorBoundary } from "@/components/error-boundary";
import { LoadingProvider } from "@/contexts/loading";
import { NotFound } from "@/pages/not-found";
import { SessionPage } from "@/pages/sessions/id/page";
import { SessionsPage } from "@/pages/sessions/page";
import ProtectedLayout from "@/protected-layout";
import RootLayout from "@/root-layout";
import { client } from "@/steel-client/client.gen";

import "@fontsource/inter";

import "@radix-ui/themes/styles.css";

// const isDarkMode = true; // You may want to make this dynamic based on user preference

client.setConfig({
  baseUrl: import.meta.env.VITE_API_URL,
});

const router = createBrowserRouter([
  {
    element: (
      <ErrorBoundary level="page" context="app-root">
        <LoadingProvider>
          <RootLayout />
        </LoadingProvider>
      </ErrorBoundary>
    ),
    children: [
      {
        element: <ProtectedLayout />,
        children: [
          { index: true, element: <Navigate to="/sessions" /> },
          {
            path: "sessions",
            element: <Outlet />,
            children: [
              {
                index: true,
                element: (
                  <RouteErrorBoundary routeName="sessions-list">
                    <SessionsPage />
                  </RouteErrorBoundary>
                ),
              },
              {
                path: ":id",
                element: (
                  <RouteErrorBoundary routeName="session-page">
                    <SessionPage />
                  </RouteErrorBoundary>
                ),
              },
            ],
          },
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
  { path: "*", element: <NotFound /> },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
