import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { copyText } from "@/utils/toasts";
import { CopyIcon } from "lucide-react";

interface LogItemProps {
  log: {
    id: string;
    timestamp: string | Date;
    type: string;
    log: string;
  };
  index: number;
}

const logTypeToColor = (type: string) => {
  if (type === "Console") return "var(--cyan-a11)";
  if (type === "Request") return "var(--pink-a11)";
  if (type === "Response") return "var(--green-a11)";
  if (type === "Error") return "var(--red-a11)";
  return "var(--sand-11)";
};

const logTypeToFormat = (type: string, log: Record<string, any>) => {
  if (type === "Console") {
    if (log.message) {
      return log.message
        .replace(/^\d{2}:\d{2}:\d{2}\.\d{3}\s+(INFO|WARN|ERROR|DEBUG)\s+/, "")
        .replace("\n", "")
        .replace("\t", "");
    }
    return log.text;
  }
  if (type === "Request") return `[${log.method}] ${log.url}`;
  if (type === "Response") return `[${log.status}] ${log.url}`;
  if (type === "Error") return log.message;
  if (type === "Navigation") return log.url || JSON.stringify(log);
  if (type === "RequestFailed") return `${log.errorText} @ ${log.url}`;
  return log.message || JSON.stringify(log);
};

export default function LogItem({ log, index }: LogItemProps) {
  const logBody = JSON.parse(log.log);
  const cleanMessage = logTypeToFormat(log.type, logBody);
  const copyableLog = {
    timestamp: log.timestamp,
    type: log.type,
    ...logBody,
    pageId: undefined,
  };

  return (
    <AccordionItem
      value={log.id + index}
      className=" hover:bg-[var(--sand-2)]"
      key={log.id + index}
    >
      <AccordionTrigger className="p-[2px] w-full hover:no-underline">
        <div className="flex-1 overflow-hidden ml-2 mr-2">
          <pre
            key={log.id + index}
            className="py-[2px] text-[12px] overflow-hidden whitespace-nowrap text-ellipsis mb-1"
          >
            <span className="text-sand-400 text-[12px]">
              {new Date(log.timestamp).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              })}
            </span>{" "}
            <span style={{ color: logTypeToColor(log.type) }}>[{log.type}]</span> {cleanMessage}
          </pre>
        </div>
      </AccordionTrigger>
      <AccordionContent className="flex flex-col gap-4">
        <pre className="px-4 whitespace-pre-wrap break-all overflow-x-hidden text-[var(--sand-11)]">
          {JSON.stringify(copyableLog, null, 2)}
        </pre>
        <Badge
          variant="secondary"
          className="cursor-pointer text-[var(--gray-11)] bg-transparent hover:text-[var(--gray-12)] gap-2 py-1 px-3 flex items-center justify-between max-w-fit"
          onClick={() => copyText(JSON.stringify(copyableLog, null, 2), "Log")}
        >
          Copy JSON
          <CopyIcon width={16} height={16} />
        </Badge>
      </AccordionContent>
    </AccordionItem>
  );
}
