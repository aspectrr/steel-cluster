import { SessionViewer } from "@/components/sessions/session-viewer";
import { LegacySessionViewer } from "@/components/sessions/session-viewer/legacy-session-viewer";
import { useFeatureFlagEnabled } from "posthog-js/react";

interface SessionViewerProps {
  id: string;
  showConsole?: boolean;
  setMostRecentUrl: (url: string) => void;
}

export function SessionViewerFeature(props: SessionViewerProps) {
  const isNewViewer = useFeatureFlagEnabled("new-session-viewer");

  if (isNewViewer) {
    return <SessionViewer {...props} />;
  }

  return <LegacySessionViewer {...props} />;
}
