import { useContext } from "react";

import { SessionsContext } from "@/contexts/sessions";
import { SessionsContextType } from "@/contexts/sessions/sessions.context.types";

export function useSessionsContext(): SessionsContextType {
  const context = useContext(SessionsContext);
  if (!context) {
    throw new Error("useSessionsContext must be used within an SessionsProvider");
  }
  return context;
}
