import { useRef } from "react";
import { EventWithTime } from "./types";

export function useSessionBuffer(_sessionId: string, _duration?: number) {
	// useSessionEvents not available in standalone mode — return empty buffer
	const initialEventsRef = useRef<undefined | EventWithTime[]>(undefined);

	return {
		data: undefined,
		initialEvents: initialEventsRef.current ?? [],
		isLoading: false,
		isError: false,
		fetchNextPage: async () => {},
		hasNextPage: false,
		isFetchingNextPage: false,
	};
}
