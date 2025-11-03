"use client";

import { Link } from "react-router-dom";
import { ArrowRightIcon, CopyIcon } from "@radix-ui/react-icons";
// import { ProxyBadge } from "@/components/badges/proxy-badge";
import { Skeleton } from "@radix-ui/themes";
import { ColumnDef } from "@tanstack/react-table";

import { UserAgentBadge } from "@/components/badges/user-agent-badge";
import { GlowingGreenDot } from "@/components/icons/GlowingGreenDot";
import { ReleaseSessionDialog } from "@/components/sessions/release-session-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { formatDateTime } from "@/lib/utils/format-date";

import { formatDuration } from "@/utils/formatting";
import { copyText } from "@/utils/toasts";

import { SessionResponse } from "@/steel-client";
import { hasSessionExpired } from "../session-viewer/constants";
export type Session = SessionResponse;

export const columns: ColumnDef<Session>[] = [
  {
    accessorFn: (session) => {
      return session.id.split("-")[0];
    },
    header: "Session ID",
    maxSize: 60,
    cell: ({ row }) => {
      if (Object.keys(row.original).length === 0)
        return (
          <div className="flex items-center gap-2 p-1">
            <Skeleton className="w-20 h-6 rounded-full" />
          </div>
        );
      return (
        <div className="flex items-center gap-2">
          <Link
            to={`/sessions/${row.original.id}`}
            className="text-[var(--sand-12)] hover:text-[var(--cyan-a11)] font-mono"
          >
            {row.original.id.split("-")[0]}
          </Link>
          <CopyIcon
            width={16}
            height={16}
            className="cursor-pointer text-[var(--sand-11)] hover:text-[var(--sand-12)] active:text-[var(--sand-10)]"
            onClick={() => copyText(row.original.id, "Session ID")}
          />
        </div>
      );
    },
  },
  {
    accessorFn: (session) => {
      return `${session.createdAt} • ${session.duration}`;
    },
    header: "Activity & Date",
    cell: ({ row }) => {
      if (Object.keys(row.original).length === 0)
        return (
          <div className="flex gap-2 items-center text-sm p-1 text-[var(--sand-11)]">
            <Skeleton className="min-h-6 rounded-full px-3 py-1">
              {"October 29 at 2:28 PM EDT • 0:00:00 • 0"}
            </Skeleton>
            <Skeleton className="w-14 h-6 rounded-full" />
          </div>
        );

      const formattedDuration = formatDuration(row.original.duration);
      return (
        <div className="flex gap-2 items-center text-sm text-[var(--sand-11)]">
          {formatDateTime(row.original.createdAt)} • {formattedDuration}
          {row.original.status === "live" && (
            <Badge
              variant="secondary"
              className="text-[var(--green-a12)] border border-[var(--green-6)] bg-transparent  gap-2 py-1 px-3 flex items-center justify-between max-w-fit rounded-full"
            >
              <GlowingGreenDot />
              Live
            </Badge>
          )}
        </div>
      );
    },
  },
  {
    accessorFn: (session) => {
      return `${session.userAgent}`;
    },
    header: "Browser Details",
    cell: ({ row }) => {
      if (Object.keys(row.original).length === 0)
        return (
          <div className="flex gap-2 p-2 text-sm text-[var(--sand-11)]">
            {/* {row.original.userAgent} {row.original.proxy} */}
            <Skeleton className="w-20 h-6 rounded-full" />
            <Skeleton className="w-20 h-6 rounded-full" />
          </div>
        );
      return (
        <div className="flex gap-2 text-sm text-[var(--sand-11)]">
          {/* {row.original.userAgent} {row.original.proxy} */}
          <UserAgentBadge userAgent={row.original.userAgent || ""} />
          {/* <ProxyBadge proxy={row.original.proxy || "207.148.1.212"} /> */}
        </div>
      );
    },
  },
  {
    id: "actions",
    header: "",
    accessorFn: (session) => {
      return session.status === "live";
    },
    cell: ({ row, cell }) => {
      const plan = (cell.getContext().table.options.meta as any)?.plan
      const isExpired = hasSessionExpired(plan, row.original.createdAt);
      if (Object.keys(row.original).length === 0)
        return (
          <div className="flex gap-2 p-1 justify-end">
            <Skeleton className="w-40 h-6 rounded-full" />
            <Skeleton className="w-40 h-6 rounded-full" />
          </div>
        );
      return (
        <div className="flex gap-2 justify-end">
          {row.original.status === "live" && (
            <ReleaseSessionDialog id={row.original.id}>
              <Button
                size="sm"
                variant="outline"
                className="text-[var(--red-11)] border-[var(--red-7)] hover:bg-[var(--red-3)]"
              >
                Release Session
              </Button>
            </ReleaseSessionDialog>
          )}
          {isExpired ? "Expired" : (
            <Link to={`/sessions/${row.original.id}`}>
              <Button size="sm" className="gap-2">
                View Session <ArrowRightIcon />
              </Button>
            </Link>
          )}
        </div>
      );
    },
  },
];
