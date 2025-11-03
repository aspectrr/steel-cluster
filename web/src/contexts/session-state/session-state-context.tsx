import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { useSocketEvent } from "@/hooks/use-socket-event";
import { StatusEventType } from "@/types/event";

import { queryClient } from "@/lib/query-client";

import { SessionResponse } from "@/steel-client";

interface SessionStateContextType {
  currentLiveSession: SessionResponse | null;
  setCurrentLiveSession: (session: SessionResponse | null) => void;
  recentlyCreatedSession: SessionResponse | null;
  recentlyEndedSession: SessionResponse | null;
}

const SessionStateContext = createContext<SessionStateContextType | null>(null);

export function useSessionState() {
  const context = useContext(SessionStateContext);
  if (!context) {
    throw new Error(
      "useSessionState must be used within a SessionStateProvider",
    );
  }
  return context;
}

interface SessionStateProviderProps {
  children: React.ReactNode;
}

export function SessionStateProvider({ children }: SessionStateProviderProps) {
  const [currentLiveSession, setCurrentLiveSession] =
    useState<SessionResponse | null>(null);
  const [recentlyCreatedSession, setRecentlyCreatedSession] =
    useState<SessionResponse | null>(null);
  const [recentlyEndedSession, setRecentlyEndedSession] =
    useState<SessionResponse | null>(null);

  // Handle session creation
  const handleSessionCreated = useCallback((sessionData: SessionResponse) => {
    setRecentlyCreatedSession(sessionData);

    // Update the sessions query cache
    const existingData = queryClient.getQueryData<{
      sessions: SessionResponse[];
    }>(["sessions"]);
    if (!existingData || !existingData.sessions) {
      queryClient.refetchQueries({ queryKey: ["sessions"] });
    } else {
      queryClient.setQueryData(["sessions"], {
        sessions: [sessionData, ...existingData.sessions],
      });
    }
  }, []);

  // Handle session ending
  const handleSessionEnded = useCallback((sessionData: SessionResponse) => {
    setRecentlyEndedSession(sessionData);

    // Update the sessions query cache only if it exists
    const existingData = queryClient.getQueryData<{
      sessions: SessionResponse[];
    }>(["sessions"]);
    if (existingData && existingData.sessions) {
      queryClient.setQueryData(["sessions"], {
        sessions: existingData.sessions.map((session) => {
          if (session.id === sessionData?.id) {
            return sessionData;
          }
          return session;
        }),
      });
    }

    // If this is the current live session, clear it
    setCurrentLiveSession((prev) =>
      prev?.id === sessionData.id ? null : prev,
    );

    // Invalidate related queries
    queryClient.refetchQueries({ queryKey: ["sessions", sessionData?.id] });
    queryClient.invalidateQueries({
      queryKey: ["sessionLogs", sessionData?.id],
    });
    queryClient.invalidateQueries({
      queryKey: ["sessionEvents", sessionData?.id],
    });
  }, []);

  // Subscribe to WebSocket events
  useSocketEvent(StatusEventType.SESSION_CREATED, handleSessionCreated);
  useSocketEvent(StatusEventType.SESSION_ENDED, handleSessionEnded);

  // Create memoized context value
  const value = useMemo(
    () => ({
      currentLiveSession,
      setCurrentLiveSession,
      recentlyCreatedSession,
      recentlyEndedSession,
    }),
    [currentLiveSession, recentlyCreatedSession, recentlyEndedSession],
  );

  return (
    <SessionStateContext.Provider value={value}>
      {children}
    </SessionStateContext.Provider>
  );
}
