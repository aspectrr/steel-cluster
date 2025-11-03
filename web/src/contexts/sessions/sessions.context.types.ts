import { ReactNode } from "react";
import {
  // UseInfiniteQueryResult,
  UseMutationResult,
  UseQueryResult,
} from "react-query";

import {
  CreateSessionRequest,
  ErrorResponse,
  // GetSessionEventsResponse,
  // GetSessionLogsResponse,
  // OrganizationDetailsResponse,
  // ReleaseSessionResponse,
  SessionResponse,
  SessionsResponse,
  // UsageDetailsResponse,
} from "@/steel-client";

export type ErrorResponseWithStatus = ErrorResponse & {
  status: number;
};

export type PaginatedResponse<T> = {
  data: T;
  nextCursor: string | null;
};

export type SessionsContextType = {
  useSessions: () => UseQueryResult<SessionsResponse, ErrorResponse>;
  useCreateSessionMutation: () => UseMutationResult<
    SessionResponse,
    ErrorResponse,
    CreateSessionRequest,
    unknown
  >;
  // useReleaseSessionMutation: () => UseMutationResult<
  //   ReleaseSessionResponse,
  //   ErrorResponse,
  //   string,
  //   unknown
  // >;
  useSession: (
    id: string,
  ) => UseQueryResult<SessionResponse | null, ErrorResponseWithStatus>;
  // useSessionLogs: (
  //   id: string,
  // ) => UseQueryResult<GetSessionLogsResponse, ErrorResponse>;
  // useSessionEvents: (
  //   id: string,
  //   limit?: number,
  // ) => UseInfiniteQueryResult<
  //   PaginatedResponse<GetSessionEventsResponse>,
  //   ErrorResponse
  // >;
  // useLegacySessionEvents: (
  //   id: string,
  // ) => UseQueryResult<GetSessionEventsResponse, ErrorResponse>;
};

export type SessionsProviderProps = {
  children: ReactNode;
};
