import { LegacySessionViewer } from "@/components/sessions/session-viewer/legacy-session-viewer";

interface SessionViewerProps {
	id: string;
	showConsole?: boolean;
	setMostRecentUrl: (url: string) => void;
}

export function SessionViewerFeature(props: SessionViewerProps) {
	return <LegacySessionViewer {...props} />;
}
