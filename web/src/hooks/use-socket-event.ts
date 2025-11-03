import { useEffect } from "react";

import { useWebSocket } from "@/contexts/websocket/websocket-context";
import { StatusEventType } from "@/types/event";

export function useSocketEvent<T = any>(
  eventType: StatusEventType,
  callback: (data: T) => void,
  deps: React.DependencyList = [],
) {
  const [subscribe] = useWebSocket();

  useEffect(() => {
    // Use the returned unsubscribe function for cleanup
    const cleanup = subscribe(eventType, callback);

    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType, ...deps]);
}
