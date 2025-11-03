// app/pageview.js
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { usePostHog } from "posthog-js/react";

export default function PostHogPageView() {
  const location = useLocation();
  const posthog = usePostHog();
  // Track pageviews
  useEffect(() => {
    if (posthog) {
      posthog.capture("$pageview", {
        $current_url: window.location.href,
      });
    }
  }, [location]);

  return null;
}
