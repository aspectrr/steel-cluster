import { Skeleton, Text } from "@radix-ui/themes";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface SkeletonTextProps {
  loading: boolean;
  children: ReactNode;
  className?: string;
  skeletonClassName?: string;
}

export function SkeletonText({
  loading,
  children,
  className,
  skeletonClassName = "w-4 h-4 rounded-md",
}: SkeletonTextProps) {
  return (
    <Text className={className}>
      <Skeleton className={cn(skeletonClassName)} loading={loading}>
        {children}
      </Skeleton>
    </Text>
  );
}
