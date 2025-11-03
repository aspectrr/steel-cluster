import { createContext, useContext, useRef } from "react";

import { LoadingContextType, LoadingProviderProps } from "./loading.types";
const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export function useLoadingContext(): LoadingContextType {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error("useLoadingContext must be used within an LoadingProvider");
  }
  return context;
}

export function LoadingProvider({ children }: LoadingProviderProps): JSX.Element {
  const loadingBarRef = useRef<any>(null);

  const contextValue = {
    loadingBarRef,
  };

  return <LoadingContext.Provider value={contextValue}>{children}</LoadingContext.Provider>;
}
