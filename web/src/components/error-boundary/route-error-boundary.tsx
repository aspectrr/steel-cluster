import React from "react";
import { useLocation } from "react-router-dom";
import ErrorBoundary from "./error-boundary";

interface RouteErrorBoundaryProps {
  children: React.ReactNode;
  routeName?: string;
}

const RouteErrorBoundary: React.FC<RouteErrorBoundaryProps> = ({
  children,
  routeName,
}) => {
  const location = useLocation();

  const handleError = (_: Error, __: React.ErrorInfo) => {};

  return (
    <ErrorBoundary
      level="page"
      context={`route:${routeName || location.pathname}`}
      showDetails={import.meta.env.DEV}
      onError={handleError}
    >
      {children}
    </ErrorBoundary>
  );
};

export default RouteErrorBoundary;
