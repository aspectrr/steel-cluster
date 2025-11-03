import { createContext, useContext, useEffect, useRef } from "react";

import { StatusMessage, StatusEventType } from "@/types/event";

// Define event types for type safety
export type { StatusMessage };
export { StatusEventType };

type SubscribeFunction = (
  channel: StatusEventType,
  callback: (data: any) => void,
) => () => void;
type UnsubscribeFunction = (
  channel: StatusEventType,
  callback: (data: any) => void,
) => void;

const WebSocketContext = createContext<
  [SubscribeFunction, UnsubscribeFunction] | null
>(null);

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocket must be used within a WebSocketProvider");
  }
  return context;
}

interface WebSocketProviderProps {
  children: React.ReactNode;
  authToken?: string;
  orgId?: string;
  refreshToken: () => void;
}

export function WebSocketProvider({
  children,
  authToken,
  orgId,
  refreshToken,
}: WebSocketProviderProps) {
  const ws = useRef<WebSocket | null>(null);
  const channels = useRef<Record<string, Set<(data: any) => void>>>({});
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const subscribe: SubscribeFunction = (channel, callback) => {
    if (!channels.current[channel]) {
      channels.current[channel] = new Set();
    }
    channels.current[channel].add(callback);

    // Return unsubscribe function for convenience
    return () => unsubscribe(channel, callback);
  };

  const unsubscribe: UnsubscribeFunction = (channel, callback) => {
    if (channels.current[channel]) {
      channels.current[channel].delete(callback);
      if (channels.current[channel].size === 0) {
        delete channels.current[channel];
      }
    }
  };

  const connect = () => {
    if (!authToken) return;

    // Close existing connection if any
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.close();
    }

    const wsUrl = `${import.meta.env.VITE_WS_URL}/v1/app-events?token=${authToken}${orgId ? `&orgId=${orgId}` : ""}`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log("WebSocket connection established");
      reconnectAttempts.current = 0;
    };

    ws.current.onclose = (event) => {
      console.log("WebSocket connection closed", event);

      // Attempt to reconnect if not a clean close
      if (!event.wasClean && reconnectAttempts.current < maxReconnectAttempts) {
        const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000);
        reconnectAttempts.current++;

        reconnectTimeoutRef.current = setTimeout(() => {
          console.log(
            `Attempting to reconnect (${reconnectAttempts.current}/${maxReconnectAttempts})`,
          );
          connect();
        }, delay);
      }
    };

    ws.current.onerror = () => {
      console.log("WebSocket connection error");
      refreshToken();
    };

    ws.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as StatusMessage;

        // Route message to appropriate channel subscribers
        if (channels.current[message.type]) {
          channels.current[message.type].forEach((callback) => {
            try {
              callback(message.payload);
            } catch (error) {
              console.error("Error in subscriber callback:", error);
            }
          });
        }

        // Also route to wildcard subscribers if any
        if (channels.current["*"]) {
          channels.current["*"].forEach((callback) => {
            try {
              callback(message);
            } catch (error) {
              console.error("Error in wildcard subscriber callback:", error);
            }
          });
        }
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
      }
    };
  };

  useEffect(() => {
    if (authToken) {
      connect();
    }

    return () => {
      if (ws.current) {
        ws.current.close();
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [authToken, orgId]);

  return (
    <WebSocketContext.Provider value={[subscribe, unsubscribe]}>
      {children}
    </WebSocketContext.Provider>
  );
}
