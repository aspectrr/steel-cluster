import React, { Component, ReactNode } from "react";
import {
  ExclamationTriangleIcon,
  ReloadIcon,
  HomeIcon,
} from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  eventId: string | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  level?: "page" | "section" | "component";
  context?: string;
  showDetails?: boolean;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  onReload?: () => void;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const { onError } = this.props;

    this.setState({
      errorInfo,
    });

    // Call custom error handler if provided
    if (onError) {
      onError(error, errorInfo);
    }

    // Log to console in development
    if (import.meta.env.DEV) {
      console.error("Error Boundary caught an error:", error);
      console.error("Error Info:", errorInfo);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  handleReportFeedback = () => {
    if (this.state.eventId) {
    }
  };

  resetErrorBoundary = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null,
    });
  };

  handleCustomReload = () => {
    if (this.props.onReload) {
      this.props.onReload();
      // Reset the error boundary state after custom reload logic
      this.resetErrorBoundary();
    }
  };

  render() {
    const { hasError, error, errorInfo, eventId } = this.state;
    const {
      children,
      fallback,
      level = "component",
      showDetails = false,
    } = this.props;

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Different layouts based on error level
      const isPageLevel = level === "page";
      const isSectionLevel = level === "section";

      return (
        <div
          className={cn(
            "flex items-center justify-center p-4",
            isPageLevel && "bg-background",
            isSectionLevel && "min-h-[400px]",
            !isPageLevel && !isSectionLevel && "min-h-[200px]",
          )}
        >
          <Card className={cn("w-full max-w-2xl", isPageLevel && "shadow-lg")}>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <ExclamationTriangleIcon className="h-8 w-8 text-destructive" />
              </div>
              <CardTitle className="text-xl">
                {isPageLevel ? "Something went wrong" : "Error occurred"}
              </CardTitle>
              <CardDescription>
                {isPageLevel
                  ? "We encountered an unexpected error. Our team has been notified."
                  : "This section encountered an error and couldn't load properly."}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {showDetails && error && (
                <div className="rounded-md bg-muted p-4">
                  <h4 className="mb-2 font-medium text-sm">Error Details:</h4>
                  <code className="text-xs text-muted-foreground break-all">
                    {error.message}
                  </code>
                  {import.meta.env.DEV && errorInfo && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                        Component Stack (Development)
                      </summary>
                      <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">
                        {errorInfo.componentStack}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Button
                  onClick={
                    this.props.onReload
                      ? this.handleCustomReload
                      : this.handleReload
                  }
                  variant="default"
                  className="flex items-center gap-2"
                >
                  <ReloadIcon className="h-4 w-4" />
                  Try Again
                </Button>

                {isPageLevel && (
                  <Button
                    onClick={this.handleGoHome}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <HomeIcon className="h-4 w-4" />
                    Go Home
                  </Button>
                )}

                {eventId && (
                  <Button
                    onClick={this.handleReportFeedback}
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                  >
                    Report Issue
                  </Button>
                )}
              </div>

              {eventId && (
                <p className="text-center text-xs text-muted-foreground">
                  Error ID: {eventId}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
