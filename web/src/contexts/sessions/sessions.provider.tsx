import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "react-query";
import { useNavigate } from "react-router-dom";

import { ToastAction } from "@/components/ui/toast";

import { useToast } from "@/hooks/use-toast";

import { queryClient } from "@/lib/query-client";

import {
  createSession,
  CreateSessionRequest,
  ErrorResponse,
  getSession,
  // getSessionEvents,
  // GetSessionEventsResponse,
  // getSessionLogs,
  // GetSessionLogsResponse,
  getSessions,
  // releaseSession,
  // ReleaseSessionResponse,
  SessionResponse,
  SessionsResponse,
} from "@/steel-client";

// import { EventWithTime } from "@/components/sessions/session-viewer/types";
// import { unpack } from "@rrweb/packer";
// import { sanitizeEvents } from "./session-event-sanitizer";
import { SessionsContext } from "./sessions.context";
import {
  // ErrorResponseWithStatus,
  // PaginatedResponse,
  SessionsProviderProps,
} from "./sessions.context.types";

export function SessionsProvider({
  children,
}: SessionsProviderProps): JSX.Element {
  // TODO: Replace with zustand store (eventually)
  const [currentSession, setCurrentSession] = useState<SessionResponse | null>(
    null,
  );
  const { toast } = useToast();
  const navigate = useNavigate();

  // useSessions — v3 positional API + data type coercion
  const useSessions = () =>
    useQuery<SessionsResponse, ErrorResponse>(
      ["sessions"],
      async () => {
        const result = await getSessions({});
        if (result.error) {
          throw result.error as ErrorResponse;
        }
        const { data } = result;
        // result.data is typed as SessionsResponse['sessions'] | undefined due to the generator
        return data as unknown as SessionsResponse;
      },
      {
        onSuccess(data) {
          console.log(data);
          data?.sessions?.forEach((session) => {
            if (session.status !== "live") {
              queryClient.setQueryData(["session", session.id], session);
              queryClient.setQueryDefaults(["session", session.id], {
                staleTime: Infinity,
                cacheTime: Infinity,
              });
            }
          });
        },
        retry: false,
      },
    );

  // useSession — v3 positional API + data type coercion
  const useSession = (sessionId: string) =>
    useQuery<SessionResponse | null, ErrorResponse>(
      ["session", sessionId],
      async () => {
        if (!sessionId) return null;

        const result = await getSession({
          path: { sessionId },
        });

        if (result.error) {
          // keep your error shape with status
          throw {
            ...result.error,
            status: result.response.status || 500,
          } as ErrorResponse & { status: number };
        }

        return result.data as SessionResponse;
      },
      {
        retry: false,
        staleTime: 0,
        cacheTime: 0,
        onSuccess: (data) => {
          setCurrentSession(data);
          if (data?.status !== "live") {
            queryClient.setQueryDefaults(["session", sessionId], {
              staleTime: Infinity,
              cacheTime: Infinity,
            });
          }
        },
      },
    );

  // const useSessionLogs = useCallback(
  //   (id: string) =>
  //     useQuery<GetSessionLogsResponse, ErrorResponse>({
  //       queryKey: ["sessionLogs", id],
  //       queryFn: async () => {
  //         const { error, data } = await getSessionLogs({
  //           path: { id },
  //         });

  //         if (error) {
  //           throw error;
  //         }
  //         return data;
  //       },
  //       staleTime: 0,
  //     }),
  //   [],
  // );

  // const useSessionEvents = (id: string) =>
  //   useInfiniteQuery<
  //     PaginatedResponse<GetSessionEventsResponse>,
  //     ErrorResponse
  //   >({
  //     queryKey: ["sessionEvents", id],
  //     queryFn: async ({ pageParam }) => {
  //       const result = await getSessionEvents({
  //         path: { id },
  //         query: {
  //           compressed: true,
  //           limit: 100,
  //           ...(pageParam && { pointer: pageParam }),
  //         },
  //       });

  //       if (result.error) {
  //         throw result.error;
  //       }

  //       const nextCursor = result.response?.headers?.get("Next-Cursor") || null;

  //       const events = result.data.map((event): EventWithTime => {
  //         const unpackedEvent =
  //           typeof event === "string"
  //             ? unpack(event)
  //             : (event as EventWithTime);
  //         return sanitizeEvents(unpackedEvent);
  //       });

  //       return {
  //         data: events,
  //         nextCursor,
  //       };
  //     },
  //     getNextPageParam: (lastPage) => lastPage.nextCursor,
  //     staleTime: 0,
  //     cacheTime: 0,
  //   });

  // const useLegacySessionEvents = useCallback(
  //   (id: string) =>
  //     useQuery<GetSessionEventsResponse, ErrorResponse>({
  //       queryKey: ["sessionEvents", id],
  //       queryFn: async () => {
  //         const { error, data } = await getSessionEvents({
  //           path: { id },
  //           query: {
  //             compressed: true,
  //           },
  //         });
  //         if (error) {
  //           throw error;
  //         }
  //         return data;
  //       },
  //       staleTime: 0,
  //       cacheTime: 0,
  //     }),
  //   [],
  // );

  // useCreateSessionMutation — v3 positional API
  const useCreateSessionMutation = useCallback(
    () =>
      useMutation<SessionResponse, ErrorResponse, CreateSessionRequest>(
        async (options: CreateSessionRequest) => {
          queryClient.cancelQueries({ queryKey: ["sessions"] });
          const { error, data } = await createSession({ body: options });
          if (error) {
            throw error;
          }
          return data as unknown as SessionResponse;
        },
        {
          onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["sessions"] });
            toast({
              title: "Session is live!",
              description: "Click to view session",
              className:
                "text-[var(--sand-12)] bg-[var(--green-a3)] border border-[var(--green-a6)]",
              action: (
                <ToastAction
                  altText="View session"
                  className="text-[var(--sand-12)] bg-[var(--green-a3)] border border-[var(--green-a6)]"
                  onClick={() => navigate(`/sessions/${data?.id}`)}
                >
                  View
                </ToastAction>
              ),
            });
          },
          onError: (error: ErrorResponse) => {
            const errorMessage =
              error?.message || "An unknown error occurred. Please try again.";
            toast({
              title: "Failed to create session",
              description: errorMessage,
              className:
                "text-[var(--sand-12)] border border-[var(--red-a6)] bg-[var(--red-a3)] ",
            });
          },
        },
      ),
    [toast, navigate],
  );

  // const useReleaseSessionMutation = useCallback(
  //   () =>
  //     useMutation<ReleaseSessionResponse, ErrorResponse, string>({
  //       mutationFn: async (id: string) => {
  //         const { error, data } = await releaseSession({
  //           path: {
  //             id,
  //           },
  //         });
  //         if (error) {
  //           throw error;
  //         }
  //         queryClient.refetchQueries({ queryKey: ["session", id] });
  //         return data;
  //       },
  //       onSuccess: () => {
  //         queryClient.invalidateQueries({ queryKey: ["sessions"] });
  //       },
  //     }),
  //   [],
  // );

  const contextValue = useMemo(
    () => ({
      currentSession,
      useSessions,
      useSession,
      // useSessionLogs,
      // useSessionEvents,
      useCreateSessionMutation,
      // useReleaseSessionMutation,
      // useLegacySessionEvents,
    }),
    [
      currentSession,
      useSessions,
      useSession,
      // useSessionLogs,
      // useSessionEvents,
      useCreateSessionMutation,
      // useReleaseSessionMutation,
      // useLegacySessionEvents,
    ],
  );

  return (
    <SessionsContext.Provider value={contextValue}>
      {children}
    </SessionsContext.Provider>
  );
}
