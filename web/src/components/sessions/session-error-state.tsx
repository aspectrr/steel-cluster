import { useNavigate } from "react-router-dom";
import {
  ArrowLeftIcon,
  ExclamationTriangleIcon,
  QuestionMarkCircledIcon,
} from "@radix-ui/react-icons";

import { Button } from "@/components/ui/button";

import { ErrorResponse } from "@/steel-client";

type SessionErrorStateProps = {
  error?: ErrorResponse;
  sessionId?: string;
  errorCode?: number;
};

export function SessionErrorState({ error, sessionId, errorCode }: SessionErrorStateProps) {
  const navigate = useNavigate();

  // Determine if it's a 404 error or another type of error
  const isNotFound = errorCode === 404;

  return (
    <div className="flex flex-col items-center justify-center flex-1 w-full h-full bg-[var(--sand-1)] p-8">
      <div className="flex flex-col items-center justify-center max-w-md p-8 bg-[var(--sand-2)] rounded-lg border border-[var(--sand-5)] shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="mb-6 animate-in zoom-in-50 duration-500 delay-200">
          {isNotFound ? (
            <div className="w-24 h-24 rounded-full bg-[var(--amber-4)] flex items-center justify-center">
              <QuestionMarkCircledIcon className="w-12 h-12 text-[var(--amber-11)]" />
            </div>
          ) : (
            <div className="w-24 h-24 rounded-full bg-[var(--tomato-4)] flex items-center justify-center">
              <ExclamationTriangleIcon className="w-12 h-12 text-[var(--tomato-11)]" />
            </div>
          )}
        </div>

        <h1 className="text-2xl font-semibold mb-2 text-[var(--sand-12)]">
          {isNotFound ? "Session Not Found" : "Error Loading Session"}
        </h1>

        <p className="text-center text-[var(--sand-11)] mb-6">
          {isNotFound
            ? `We couldn't find a session with ID: ${sessionId || "unknown"}`
            : "There was a problem loading this session. This might be due to a network issue or the session may have expired."}
        </p>

        {error && !isNotFound && (
          <div className="bg-[var(--sand-3)] p-3 rounded-md mb-6 w-full overflow-auto">
            <code className="text-xs text-[var(--sand-12)] whitespace-pre-wrap">
              {error.message || JSON.stringify(error, null, 2)}
            </code>
          </div>
        )}

        <div className="flex gap-4">
          <Button
            variant="secondary"
            className="flex items-center gap-2"
            onClick={() => navigate("/sessions")}
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to sessions
          </Button>

          {!isNotFound && (
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
              className="text-[var(--sand-11)] border-[var(--sand-7)] hover:bg-[var(--sand-4)]"
            >
              Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
