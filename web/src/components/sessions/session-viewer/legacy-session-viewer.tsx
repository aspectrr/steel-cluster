import { useEffect, useRef, useState } from "react";
import { unpack } from "@rrweb/packer";
import rrwebPlayer from "rrweb-player";

import { LoadingSpinner } from "@/components/icons/LoadingSpinner";

import { useSessionsContext } from "@/hooks/use-sessions-context";

import { EmptyState } from "./empty-state";
import { LiveEmptyState } from "./live-empty-state";

import "./session-viewer-controls.css";

type SessionViewerProps = {
  id: string;
  showConsole?: boolean;
  setMostRecentUrl: (url: string) => void;
};

export function LegacySessionViewer({ id, showConsole, setMostRecentUrl }: SessionViewerProps) {
  const { useSession, useLegacySessionEvents } = useSessionsContext();
  const { data: session, isLoading: isSessionLoading, isError: isSessionError } = useSession(id);
  const {
    data: existingEvents,
    isLoading: isEventsLoading,
    isError: isEventsError,
  } = useLegacySessionEvents(id);

  const playerRef = useRef<rrwebPlayer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerCreatedRef = useRef(false);

  const [events, setEvents] = useState<any[]>([]);
  const [hasEvents, setHasEvents] = useState(false);

  useEffect(() => {
    if (existingEvents) {
      const unpackedEvents = existingEvents.map((event) =>
        typeof event === "string" ? unpack(event) : event,
      );
      // Use stored logs for non-live sessions
      setEvents((prevEvents) => [...prevEvents, ...unpackedEvents]);
    }
  }, [session, id, existingEvents]);

  useEffect(() => {
    if (
      hasEvents &&
      !playerRef.current &&
      !playerCreatedRef.current &&
      !isSessionLoading &&
      !isSessionError &&
      session?.status != "live" &&
      containerRef.current
    ) {
      playerRef.current = new rrwebPlayer({
        target: containerRef.current,
        props: {
          events,
          autoPlay: true,
          skipInactive: true,
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight - 80,
          mouseTail: false,
        },
      });
      playerCreatedRef.current = true;
      playerRef.current.addEventListener("event-cast", (event) => {
        if (event.type === 4 && event.data.href !== "about:blank") {
          setMostRecentUrl(event.data.href);
        }
      });
    }

    return () => {
      if (playerRef.current) {
        playerRef.current = null;
        playerCreatedRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasEvents, isSessionLoading, isSessionError, session?.status]);

  useEffect(() => {
    let maxTimestamp = 0;
    let firstUrl = "";
    let foundEvents = false;

    for (const event of events) {
      if (event.type === 4 && event.data.href !== "about:blank" && events.length >= 2) {
        foundEvents = true;
        if (event.timestamp > maxTimestamp) {
          maxTimestamp = event.timestamp;
          if (!firstUrl) firstUrl = event.data.href;
        }
      }
    }

    setHasEvents(foundEvents);
    if (firstUrl) setMostRecentUrl(firstUrl);

    if (playerRef.current) {
      // @ts-expect-error $set doesn't exist in ts
      playerRef.current.$set({ events });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  useEffect(() => {
    const updateSize = () => {
      if (playerRef.current && containerRef.current) {
        // @ts-expect-error $set doesn't exist in ts
        playerRef.current.$set({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight - 80,
        });
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [showConsole]);

  const isLive = session?.status === "live";

  if (isSessionLoading || isEventsLoading)
    return (
      <div
        ref={containerRef}
        className="flex flex-col w-full flex-1 border-t border-[var(--sand-3)]"
      >
        <div className="flex flex-col items-center justify-center flex-1 w-full">
          <LoadingSpinner className="w-16 h-16 text-[var(--3)]" />
        </div>
      </div>
    );

  if (isSessionError || isEventsError)
    return (
      <div
        ref={containerRef}
        className="flex flex-col w-full flex-1 border-t border-[var(--sand-3)]"
      >
        <h1 className="text-[var(--tomato-5)]">Error loading session</h1>
      </div>
    );

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
      {!isEventsLoading && !hasEvents && !isLive && <EmptyState />}
    </div>
  );
}