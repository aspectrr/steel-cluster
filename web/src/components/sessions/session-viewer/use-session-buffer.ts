import { useSessionsContext } from "@/hooks/use-sessions-context";
import { useRef } from "react";
import { EventWithTime } from "./types";

export function useSessionBuffer(sessionId: string, duration?: number) {
  const { useSessionEvents } = useSessionsContext();
  const paginatedQuery = useSessionEvents(sessionId);
  const initialEventsRef = useRef<undefined | EventWithTime[]>(undefined);

  if (initialEventsRef.current === undefined && paginatedQuery.data?.pages?.[0]?.data?.length) {
    // Inject a mouse move event as the last event to extend the duration to actual session duration
    const firstEvent = paginatedQuery.data.pages[0].data?.[0] as EventWithTime | undefined;
    const endEvent: EventWithTime[] | undefined = duration && firstEvent 
      ? [{
        "type": 3,
        "data": {
          "source": 2,
          "type": 1,
          "id": 1,
          "x": 0,
          "y": 1
        },
        "timestamp": firstEvent.timestamp + duration
      }] 
    : [];
    initialEventsRef.current = [...(paginatedQuery.data.pages[0].data as EventWithTime[]), ...endEvent];
  }

  return {
    ...paginatedQuery,
    initialEvents: initialEventsRef.current ?? [],
  };
}
