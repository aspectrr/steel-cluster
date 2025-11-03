import { CopyIcon } from "@radix-ui/react-icons";
import { Skeleton } from "@radix-ui/themes";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { useSessionsContext } from "@/hooks/use-sessions-context";

import { formatBytes, formatDurationWords, msToMinutes } from "@/utils/formatting";
import { copyText } from "@/utils/toasts";

import { ReleaseSessionDialog } from "../release-session-dialog";
import { cn } from "@/lib/utils";

export default function SessionDetails({ id, className }: { id: string; className?: string }) {
  const { useSession } = useSessionsContext();
  const { data: session, isLoading, isError } = useSession(id);

  const sessionDetails = useMemo(() => {
    if (!session) return [];

    return [
      {
        label: "ID",
        value: session.id,
        tooltip: "Unique identifier for the session",
        copyable: true,
      },
      {
        label: "Timestamp",
        value: session.createdAt?.toLocaleString() || "N/A",
        tooltip: "Date and time of when the session was created",
      },
      {
        label: "Duration",
        value: formatDurationWords(session.duration ?? 0),
        tooltip: "Duration of the session",
        valueTooltip: `${session.duration || 0} milliseconds`,
      },
      {
        label: "User Agent",
        value: session.userAgent || "N/A",
        tooltip: "User agent of the browser",
        copyable: true,
      },
      {
        label: "isSelenium",
        value: session.isSelenium?.toString() || "false",
        tooltip: "Whether the session is a Selenium session",
      },
      {
        label: "Auto-captcha",
        value: session.solveCaptcha?.toString() || "false",
        tooltip: "Whether solving captchas is enabled",
      },
      {
        label: "Proxy Enabled",
        value: session.proxySource ? "Yes" : "No",
        tooltip: "Whether a proxy was used for the session",
      },
      {
        label: "Proxy Provider",
        value: session?.proxySource
          ? session.proxySource.charAt(0).toUpperCase() + session.proxySource.slice(1)
          : "N/A",
        tooltip: "Whether a user-provided proxy was used for the session Steel's proxy",
      },
      {
        label: "Proxy Bandwidth Used",
        value:
          session.status === "live"
            ? "Waiting for session to end..."
            : formatBytes(session.proxyBytesUsed ?? 0),
        tooltip: "Total bandwidth used with the proxy",
      },
      {
        label: "Cost",
        value: (msToMinutes(session.duration ?? 0) * 0.0016).toFixed(4),
        tooltip: "Cost of the session in dollars",
      },
      {
        label: "Websocket URL",
        value: !session.isSelenium ? `${session.websocketUrl.slice(0, 30)}...` : "N/A",
        tooltip: "Websocket connection URL for the session",
        fullValue: !session.isSelenium ? session.websocketUrl : "N/A",
        copyable: true,
      },
    ];
  }, [session]);

  const renderLoadingSkeleton = () => (
    <>
      {Array.from({ length: 9 }).map((_, index) => (
        <div
          key={`session-detail-skeleton-${index}`}
          className="flex flex-col gap-2 px-2 py-2 border-b border-[var(--sand-3)]"
        >
          <Skeleton className="w-full h-4 border-b border-[var(--sand-3)]" />
        </div>
      ))}
    </>
  );

  const renderDetailRow = (detail: (typeof sessionDetails)[0], index: number) => (
    <div
      key={`session-detail-${index}`}
      className="flex w-full flex-row gap-2 px-2 justify-between py-2 border-b border-[var(--sand-3)]"
    >
      <div className="text-[var(--sand-11)] flex min-w-[100px] gap-1 items-center">
        {detail.tooltip ? (
          <Tooltip>
            <TooltipTrigger>{detail.label}</TooltipTrigger>
            <TooltipContent className="text-xs text-[var(--sand-11)] bg-[var(--sand-1)] border border-[var(--sand-3)]">
              {detail.tooltip}
            </TooltipContent>
          </Tooltip>
        ) : (
          detail.label
        )}
      </div>
      <div className="text-right flex gap-2 justify-end items-center">
        {detail.valueTooltip ? (
          <Tooltip>
            <TooltipTrigger>{detail.value}</TooltipTrigger>
            <TooltipContent className="text-xs text-[var(--sand-11)] bg-[var(--sand-1)] border border-[var(--sand-3)]">
              {detail.valueTooltip}
            </TooltipContent>
          </Tooltip>
        ) : (
          detail.value
        )}
        {detail.copyable && (
          <CopyIcon
            className="min-w-4 min-h-4 cursor-pointer text-[var(--gray-11)] hover:text-[var(--gray-12)] active:text-[var(--gray-10)]"
            onClick={() =>
              copyText(
                (detail.label === "Websocket URL"
                  ? detail.fullValue?.toString()
                  : detail.value?.toString()) ?? "",
                detail.label,
              )
            }
          />
        )}
      </div>
    </div>
  );

  const renderReleaseButton = () => {
    if (session?.status !== "live") return null;

    return (
      <div className="mt-auto border-t border-[var(--sand-6)] py-4">
        <ReleaseSessionDialog id={id}>
          <Button
            variant="outline"
            className="flex w-full bg-transparent text-[var(--red-11)] border-[var(--red-7)] hover:bg-[var(--red-3)]"
          >
            Release Session
          </Button>
        </ReleaseSessionDialog>
      </div>
    );
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          "w-full h-full overflow-y-auto overflow-x-scroll bg-[var(--sand-1)] pt-8 font-mono text-xs flex flex-col",
          className,
        )}
      >
        {isLoading && renderLoadingSkeleton()}

        {isError && <div>Error loading session</div>}

        {session && sessionDetails.map(renderDetailRow)}

        {renderReleaseButton()}
      </div>
    </TooltipProvider>
  );
}
