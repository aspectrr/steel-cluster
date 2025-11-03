import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GridPattern } from "@/components/ui/grid-pattern";

import { cn } from "@/lib/utils";

import { CommandLine } from "../illustrations/command-line";

export function EmptyState() {
  return (
    <Card className="relative w-full h-full px-24 pb-12 pt-14 border-[var(--sand-6)] overflow-hidden bg-transparent border-none">
      <GridPattern
        squares={[
          [4, 4],
          [5, 1],
          [8, 2],
          [5, 3],
          [5, 5],
          [10, 10],
          [12, 15],
          [15, 10],
          [10, 15],
          [15, 10],
        ]}
        className={cn(
          "[mask-image:radial-gradient(400px_circle_at_center,white,transparent)]",
          "inset-x-0 inset-y-[-30%] h-[170%] skew-y-12",
        )}
      />
      <CardHeader className="flex flex-col gap-4 max-w-[365px] mt-12 mx-auto relative">
        <CardTitle className="text-2xl font-medium">
          Your data will appear here
        </CardTitle>
        <CardDescription className="text-md">
          Make your first API call to start viewing sessions .
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center items-center w-full relative">
        <CommandLine />
      </CardContent>
    </Card>
  );
}

export function EmptySessions() {
  return <EmptyState />;
}
