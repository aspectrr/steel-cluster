export enum StatusEventType {
  SESSION_CREATED = "session_created",
  SESSION_ENDED = "session_ended",
  USER_ONBOARDED = "user_onboarded",
  API_REQUEST_SENT = "api_request_sent",
  API_REQUEST_RECEIVED = "api_request_received",
  API_REQUEST_ERROR = "api_request_error",
  API_REQUEST_SUCCESS = "api_request_success",
}

export interface StatusMessage {
  type: StatusEventType;
  payload: any;
}
