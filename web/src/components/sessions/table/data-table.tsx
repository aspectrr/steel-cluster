"use client";

import { useMemo } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { Skeleton } from "@radix-ui/themes";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { hasSessionExpired } from "../session-viewer/constants";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading: boolean;
  plan: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading,
  plan,
}: DataTableProps<TData, TValue>) {
  const tableData = useMemo(() => (isLoading ? Array(30).fill({}) : data), [isLoading, data]);

  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    rowCount: data.length,
    meta: { plan },
  });

  return (
    <div className="flex flex-col items-center overflow-hidden flex-1 w-full">
      <div className="rounded-md w-full overflow-y-scroll">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-[hsl(var(--base-6))]">
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const isExpired = hasSessionExpired(plan, row.original.createdAt);
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className={`border-[#404040] ${isExpired ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No live sessions.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between w-full text-muted-foreground">
        {isLoading ? (
          <Skeleton className="ml-2 w-20 h-5 rounded-full" />
        ) : (
          <div className="text-sm">
            {`${table.getRowModel().rows.length.toLocaleString()} of ${data.length.toLocaleString()} Rows`}
          </div>
        )}

        <div className="flex items-center justify-end space-x-2 py-4">
          {isLoading ? (
            <Skeleton className="w-20 h-5 rounded-full mr-2" />
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronLeftIcon /> Previous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next <ChevronRightIcon />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
