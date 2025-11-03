import { useCallback, useEffect, useMemo, useRef } from "react";

import { LoadingSpinner } from "@/components/icons/LoadingSpinner";
import { useSessionsContext } from "@/hooks/use-sessions-context";

import type { PlayerHandle } from "./player/components/Player";
import { Player } from "./player/components/Player";
import * as actions from "./player/player-actions";

import { EmptyState } from "./empty-state";
import { LiveEmptyState } from "./live-empty-state";
import "./session-viewer-controls.css";
import { useSessionBuffer } from "./use-session-buffer";
import { FetchNextPageOptions, InfiniteQueryObserverResult } from "react-query";
import { PaginatedResponse } from "@/contexts/sessions/sessions.context.types";
import { ErrorResponse, GetSessionEventsResponse } from "@/steel-client";
import { hasSessionExpired } from "./constants";
import { eventWithTime } from "@rrweb/types";
import { useResizeObserver } from "@/hooks/use-resizer";

type SessionViewerProps = {
  id: string;
};

interface FetcherRef {
  fetchNextPage: (
    options?: FetchNextPageOptions,
  ) => Promise<
    InfiniteQueryObserverResult<PaginatedResponse<GetSessionEventsResponse>, ErrorResponse>
  >;
  hasNextPage: boolean | undefined;
  isFetchingNextPage: boolean;
}

export function SessionViewer({ id }: SessionViewerProps) {
  const { useSession,  } = useSessionsContext();
  const { data: session, isLoading: isSessionLoading, isError: isSessionError } = useSession(id);

  const {
    initialEvents,
    fetchNextPage,
    hasNextPage,
    isLoading: isEventsLoading,
    isError: isEventsError,
    isFetchingNextPage,
  } = useSessionBuffer(id, session?.duration);

  const plan = "hobby";

  const playerRef = useRef<PlayerHandle | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetcherRef = useRef<FetcherRef | undefined>({
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  });
  useEffect(() => {
    fetcherRef.current = { fetchNextPage, hasNextPage, isFetchingNextPage };
    return () => {
      fetcherRef.current = undefined;
    };
  });

  const hasEvents = useMemo(() => initialEvents.length > 1, [initialEvents]);

  const handleBufferEnd = useCallback(async (): Promise<eventWithTime[] | undefined> => {
    if (!fetcherRef.current) return;
    const { fetchNextPage, hasNextPage, isFetchingNextPage } = fetcherRef.current;
    if (hasNextPage && !isFetchingNextPage) {
      const result = await fetchNextPage();
      // normally only flips back to false only after React-Query pushes the
      // new data through and your component re-renders
      fetcherRef.current.isFetchingNextPage = false;
      const newData = result.data?.pages.at(-1)?.data;
      return newData as eventWithTime[];
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (hasEvents && containerRef.current && playerRef.current) {
      playerRef.current.init(containerRef.current);
    }
    return () => {
      playerRef.current?.destroy();
    };
  }, [hasEvents]);

  useResizeObserver(containerRef, () => {
    if (!containerRef.current) return;
    actions.updateDimensions(containerRef.current.clientWidth, containerRef.current.clientHeight);
  });

  const isLive = session?.status === "live";

  if (isSessionLoading || (isEventsLoading && !initialEvents.length)) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 w-full border-t border-[var(--sand-3)]">
        <LoadingSpinner className="w-16 h-16 text-[var(--3)]" />
      </div>
    );
  }

  if (isSessionError || isEventsError) {
    return (
      <div className="flex flex-col w-full flex-1 border-t border-[var(--sand-3)]">
        <h1 className="text-[var(--tomato-5)]">Error loading session</h1>
      </div>
    );
  }

  const isExpired = hasSessionExpired(plan, session?.createdAt ?? new Date());

  return (
    <div
      ref={containerRef}
      className="flex flex-col w-full overflow-hidden flex-1 border-t border-[var(--sand-3)]"
    >
      {isLive && !session?.debugUrl && <LiveEmptyState session={session!} />}
      {isLive && session?.debugUrl && (
        <iframe
          src={session?.debugUrl}
          sandbox="allow-same-origin allow-scripts"
          className="w-full max-h-full aspect-[16/10] border border-[var(--sand-3)]"
        />
      )}

      {!isLive && hasEvents && (
        <Player
          ref={playerRef}
          events={initialEvents}
          onBufferEnd={handleBufferEnd}
          approximateTotalTime={session?.duration}
        />
      )}
      {!isEventsLoading && !hasEvents && !isLive && <EmptyState expired={isExpired} />}
    </div>
  );
}
