import { createContext } from "react";

import { SessionsContextType } from "./sessions.context.types";

export const SessionsContext = createContext<SessionsContextType | undefined>(undefined);
