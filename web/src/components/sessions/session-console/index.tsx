import { useState } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useSessionsContext } from "@/hooks/use-sessions-context";

import { GetSessionResponse } from "@/steel-client";

import SessionDetails from "./session-details";
import SessionLogs from "./session-logs";

interface SessionConsoleProps {
  id: string;
  sessionStatus: GetSessionResponse["status"];
}

const tabs: { value: "details" | "logs"; label: string }[] = [
  { value: "details", label: "Details" },
  { value: "logs", label: "Logs" },
];

export default function SessionConsole({ id, sessionStatus }: SessionConsoleProps) {
  const [activeTab, setActiveTab] = useState<"details" | "logs">("details");
  const { useSessionLogs } = useSessionsContext();
  useSessionLogs(id);

  return (
    <div className="flex flex-col w-full h-full">
      <div className="flex flex-row justify-between items-center border-b border-[var(--sand-3)] p-2">
        <Tabs defaultValue="details">
          <TabsList className="bg-transparent">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`!bg-transparent !box-shadow-none rounded-none p-4 ${
                  activeTab === tab.value ? "border-b-2 border-b-[var(--sand-11)]" : ""
                }`}
              >
                {tab.label}
              </TabsTrigger>
            ))}
            {/*
            <TabsTrigger value="dev-tools">Dev Tools</TabsTrigger>
           */}
          </TabsList>
        </Tabs>
      </div>

      {activeTab === "details" && <SessionDetails id={id} />}
      {activeTab === "logs" && <SessionLogs id={id} sessionStatus={sessionStatus} />}
    </div>
  );
}
