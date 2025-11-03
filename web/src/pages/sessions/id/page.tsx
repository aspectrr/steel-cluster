import { ArrowLeftIcon, ArrowRightIcon } from "@radix-ui/react-icons";
import { useState } from "react";
import { useParams } from "react-router-dom";

import { LoadingSpinner } from "@/components/icons/LoadingSpinner";
import SessionConsole from "@/components/sessions/session-console";
import { SessionErrorState } from "@/components/sessions/session-error-state";
import { Button } from "@/components/ui/button";

import { useSessionsContext } from "@/hooks/use-sessions-context";
import { SessionViewerFeature } from "./session-viewer-feature";

export function SessionPage() {
  const { id } = useParams();
  const { useSession } = useSessionsContext();
  const { data: session, isLoading, isError, error } = useSession(id!);
  const [showConsole, setShowConsole] = useState(true);

  if (isLoading)
    return (
      <div className="flex flex-col items-center justify-center flex-1 w-full">
        <LoadingSpinner className="w-16 h-16 text-[var(--sand-6)]" />
      </div>
    );

  if (isError || !session || !id) {
    return (
      <SessionErrorState
        error={error || undefined}
        sessionId={id}
        errorCode={error?.status || 500}
      />
    );
  }

  return (
    <div className="flex flex-col overflow-hidden items-center justify-center h-full w-full p-4">
      <div className="flex flex-col overflow-hidden items-center justify-center h-full w-full rounded-md bg-[var(--sand-1)] p-4 pt-2 gap-3">
        <div className="flex items-center overflow-hidden justify-center h-full w-full gap-3">
          <div
            className={`flex flex-col items-center justify-center h-full flex-1 border border-[var(--sand-3)] relative rounded-md ${
              showConsole ? "w-2/3" : "w-full"
            }`}
          >
            <Button
              variant="secondary"
              onClick={() => setShowConsole(!showConsole)}
              className="text-primary bg-[var(--sand-3)] rounded-lg absolute top-2 right-2 z-10"
            >
              {showConsole ? (
                <ArrowRightIcon className="w-4 h-4" />
              ) : (
                <ArrowLeftIcon className="w-4 h-4" />
              )}
            </Button>
            {/*<SessionErrorBoundary sessionId={id} context="viewer">*/}
            <SessionViewerFeature
              id={id!}
              showConsole={showConsole}
              setMostRecentUrl={() => {}}
            />
            {/*</SessionErrorBoundary>*/}
          </div>
          {showConsole && (
            <div className="flex flex-col items-center overflow-hidden w-1/3 justify-center h-full text-[var(--sand-12)] gap-2">
              <div className="flex flex-col items-center overflow-hidden justify-center w-full h-full border border-[var(--sand-3)] rounded-md">
                {/*<SessionErrorBoundary sessionId={id} context="console">*/}
                {session && (
                  <SessionConsole id={id} sessionStatus={session.status} />
                )}
                {/*</SessionErrorBoundary>*/}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
