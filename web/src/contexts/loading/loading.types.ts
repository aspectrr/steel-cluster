import { ReactNode } from "react";

export type LoadingContextType = {
  loadingBarRef: React.RefObject<any>;
};

export type LoadingProviderProps = {
  children: ReactNode;
};
