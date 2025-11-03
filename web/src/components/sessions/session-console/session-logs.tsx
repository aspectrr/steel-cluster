import { Accordion } from "@/components/ui/accordion";
import { useSessionsContext } from "@/hooks/use-sessions-context";
import { GetSessionLogsResponse, GetSessionResponse } from "@/steel-client";
import { useEffect, useRef, useState } from "react";
import LogItem from "./log-item";

const getTimestamp = (timestamp: string | Date): number => {
  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }
  return new Date(timestamp).getTime();
};

const findInsertPosition = (
  logs: GetSessionLogsResponse,
  timestamp: number,
): number => {
  let left = 0;
  let right = logs.length;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (getTimestamp(logs[mid].timestamp) <= timestamp) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  return left;
};

interface LogWithCachedTimestamp {
  log: GetSessionLogsResponse[0];
  timestamp: number;
}

const mergeLogs = (
  prevLogs: GetSessionLogsResponse,
  newLogs: GetSessionLogsResponse,
  transform?: (log: any) => any,
): GetSessionLogsResponse => {
  if (newLogs.length === 0) return prevLogs;

  const processedNewLogs = transform ? newLogs.map(transform) : newLogs;

  if (prevLogs.length === 0) {
    return processedNewLogs.sort(
      (a, b) => getTimestamp(a.timestamp) - getTimestamp(b.timestamp),
    );
  }

  const existingIds = new Set(prevLogs.map((log) => log.id));

  const uniqueNewLogsWithTimestamp: LogWithCachedTimestamp[] = [];
  for (const log of processedNewLogs) {
    if (!existingIds.has(log.id)) {
      uniqueNewLogsWithTimestamp.push({
        log,
        timestamp: getTimestamp(log.timestamp),
      });
    }
  }

  if (uniqueNewLogsWithTimestamp.length === 0) return prevLogs;

  if (uniqueNewLogsWithTimestamp.length > prevLogs.length * 0.1) {
    return [
      ...prevLogs,
      ...uniqueNewLogsWithTimestamp.map((item) => item.log),
    ].sort((a, b) => getTimestamp(a.timestamp) - getTimestamp(b.timestamp));
  }

  const result = [...prevLogs];

  uniqueNewLogsWithTimestamp.sort((a, b) => a.timestamp - b.timestamp);

  let lastInsertPos = 0;
  for (const { log, timestamp } of uniqueNewLogsWithTimestamp) {
    const position =
      findInsertPosition(result.slice(lastInsertPos), timestamp) +
      lastInsertPos;
    result.splice(position, 0, log);
    lastInsertPos = position;
  }

  return result;
};

export default function SessionLogs({
  id,
  sessionStatus,
}: {
  id: string;
  sessionStatus: GetSessionResponse["status"];
}) {
  const { useSessionLogs } = useSessionsContext();
  const [logs, setLogs] = useState<GetSessionLogsResponse>([]);
  const { data: storedLogs, isLoading, isError } = useSessionLogs(id);
  const consoleRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [logOffset, setLogOffset] = useState(0);
  const logsPerPage = 40;

  useEffect(() => {
    if (!isLoading && !isError && storedLogs) {
      setLogs((prevLogs) => mergeLogs(prevLogs, storedLogs));
    }
  }, [isLoading, isError, storedLogs]);

  useEffect(() => {
    if (sessionStatus !== "live") return;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    const connectWebSocket = async () => {
      try {
        const authenticated = false;

        wsRef.current = new WebSocket(
          authenticated
            ? `${import.meta.env.VITE_WS_URL}/v1/sessions/${id}/logs`
            : `${import.meta.env.VITE_WS_URL}/v1/sessions/public/${id}/logs`,
        );

        wsRef.current.onopen = () => {
          console.debug("WebSocket connected successfully");
        };

        wsRef.current.onmessage = (event) => {
          const wsLogs = JSON.parse(event.data);
          setLogs((prevLogs) =>
            mergeLogs(prevLogs, wsLogs, (log) => ({
              ...log,
              timestamp: log.createdAt,
            })),
          );
        };

        wsRef.current.onclose = (event) => {
          console.debug("WebSocket closed:", event.code, event.reason);
          wsRef.current = null;
        };

        wsRef.current.onerror = (error) => {
          console.error("WebSocket error:", error);
          wsRef.current = null;
        };
      } catch (error) {
        console.error("Failed to connect WebSocket:", error);
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [sessionStatus, id]);

  useEffect(() => {
    const handleScroll = () => {
      if (consoleRef.current) {
        if (consoleRef.current.scrollTop === 0) {
          const previousHeight = consoleRef.current.scrollHeight;

          setLogOffset((prevOffset) => {
            requestAnimationFrame(() => {
              if (consoleRef.current) {
                const newHeight = consoleRef.current.scrollHeight;
                const heightDifference = newHeight - previousHeight;
                consoleRef.current.scrollTop = heightDifference;
              }
            });
            return prevOffset + logsPerPage;
          });
        }
      }
    };

    const consoleElement = consoleRef.current;
    if (consoleElement) {
      consoleElement.addEventListener("scroll", handleScroll);
    }

    return () => {
      if (consoleElement) {
        consoleElement.removeEventListener("scroll", handleScroll);
      }
    };
  }, []);

  useEffect(() => {
    if (!isLoading && !isError && storedLogs) {
      const paginatedLogs = storedLogs.slice(0, logOffset + logsPerPage);
      setLogs((prevLogs) => mergeLogs(prevLogs, paginatedLogs));
    }
  }, [logOffset, isLoading, isError, storedLogs]);

  // Add a helper function to check if scrolled to bottom
  const isScrolledToBottom = () => {
    if (!consoleRef.current) return false;
    const { scrollTop, scrollHeight, clientHeight } = consoleRef.current;
    // Add small threshold (1px) to account for floating point rounding
    return Math.abs(scrollHeight - clientHeight - scrollTop) < 1;
  };

  useEffect(() => {
    if (consoleRef.current && isScrolledToBottom()) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div
      ref={consoleRef}
      className="w-full h-full overflow-y-auto overflow-x-hidden bg-[var(--sand-1)] font-mono text-xs flex flex-col"
    >
      {isLoading && <p className="text-sand-400">Loading logs...</p>}
      {isError && <p className="text-red-500">Error loading logs</p>}
      {logs.length === 0 && <p className="text-sand-400">No logs yet...</p>}
      {logs && logs.length > 0 && (
        <Accordion type="multiple" className="w-full">
          {logs.slice(-logOffset - logsPerPage).map((log, index) => (
            <LogItem key={log.id + index} log={log} index={index} />
          ))}
        </Accordion>
      )}
    </div>
  );
}
