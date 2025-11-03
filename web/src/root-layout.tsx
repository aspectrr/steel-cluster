import { QueryClientProvider } from "react-query";
import { Outlet } from "react-router-dom";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

import { ThemeProvider } from "@/components/theme-provider";
import { ErrorBoundary } from "@/components/error-boundary";

import { SessionStateProvider } from "./contexts/session-state/session-state-context";
import { SessionsProvider } from "./contexts/sessions";
import { WebSocketProvider } from "./contexts/websocket/websocket-context";
import { queryClient } from "./lib/query-client";

if (typeof window !== "undefined") {
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST,
    capture_pageview: false,
  });
}

export default function RootLayout() {
  return (
    <ErrorBoundary level="page" context="root-providers">
      <PostHogProvider client={posthog}>
        <QueryClientProvider client={queryClient}>
          <ErrorBoundary level="section" context="websocket-provider">
            <WebSocketProvider authToken={""} refreshToken={() => ""}>
              <ErrorBoundary level="section" context="session-providers">
                <SessionStateProvider>
                  <SessionsProvider>
                    <ThemeProvider
                      defaultTheme="dark"
                      storageKey="steel-ui-theme"
                    >
                      <Outlet />
                    </ThemeProvider>
                  </SessionsProvider>
                </SessionStateProvider>
              </ErrorBoundary>
            </WebSocketProvider>
          </ErrorBoundary>
        </QueryClientProvider>
      </PostHogProvider>
    </ErrorBoundary>
  );
}
