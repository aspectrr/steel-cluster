import { useState } from "react";

import { CreateSessionDialog } from "@/components/sessions/create-session-dialog";
import { EmptySessions } from "@/components/sessions/empty-sessions";
import { columns } from "@/components/sessions/table/columns";
import { DataTable } from "@/components/sessions/table/data-table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useSessionsContext } from "@/hooks/use-sessions-context";

export function SessionsPage() {
  const { useSessions } = useSessionsContext();
  const [isLive, setIsLive] = useState(false);

  const { data, error, isLoading: isSessionsLoading } = useSessions();
  const plan = "hobby";

  console.log("DATAL: ", data);

  const isLoading = isSessionsLoading;

  if (error) return <div>Error: {error?.message}</div>;

  const sessions = isLive
    ? data?.sessions.filter((session) => session.status === "live")
    : data?.sessions;

  console.log("SESSIONS", sessions);

  return (
    <div className="flex flex-col overflow-y-hidden items-center justify-center flex-1 w-full">
      {isLoading || isLive || sessions?.length ? (
        <div className="flex flex-col items-center overflow-hidden justify-center flex-1 w-full p-[24px] gap-8">
          <div className="flex justify-between w-full">
            <Tabs defaultValue="all" className="w-[400px]" color="gray">
              <TabsList className="bg-[var(--sand-1)] border border-[var(--sand-3)] text-[var(--sand-10)] py-2">
                <TabsTrigger
                  value="all"
                  onClick={() => setIsLive(false)}
                  className={`${isLive ? "text-[var(--sand-10)]" : "!bg-[var(--sand-2)]"}`}
                >
                  All Sessions
                </TabsTrigger>
                <TabsTrigger
                  value="live"
                  onClick={() => setIsLive(true)}
                  className={`${isLive ? "!bg-[var(--sand-2)]" : "text-[var(--sand-10)]"}`}
                >
                  Live Sessions
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <CreateSessionDialog>
              <Button size="sm">Start Session</Button>
            </CreateSessionDialog>
          </div>
          <DataTable
            columns={columns}
            data={sessions || []}
            isLoading={isLoading}
            plan={plan}
          />
        </div>
      ) : null}
      {!isLoading && !isLive && !sessions?.length && <EmptySessions />}
    </div>
  );
}
