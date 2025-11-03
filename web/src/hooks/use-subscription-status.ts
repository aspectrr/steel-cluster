import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "react-query";
import { useSessionsContext } from "./use-sessions-context";
import { UsageDetailsResponse } from "@/steel-client";

interface UseSubscriptionStatusProps {
  isPolling: boolean;
  incomingPlan: string;
  onSuccess?: (data: any) => void;
  pollingInterval?: number;
  maxPollingDuration?: number;
}

export type SubscriptionStatus = {
  isPolling: boolean;
  isComplete: boolean;
  data: UsageDetailsResponse | null;
  error: string | null;
};

export const useSubscriptionStatus = ({
  isPolling,
  incomingPlan,
  onSuccess,
  pollingInterval = 1000, // Poll every 1 second
  maxPollingDuration = 12000, // Stop polling after 12 seconds
}: UseSubscriptionStatusProps): SubscriptionStatus => {
  const [status, setStatus] = useState<SubscriptionStatus>({
    isPolling: false,
    isComplete: false,
    data: null,
    error: null,
  });

  const queryClient = useQueryClient();

  // Use refs to avoid stale closures and dependency issues
  const onSuccessRef = useRef(onSuccess);
  const isPollingRef = useRef(isPolling);

  // Update refs when props change
  onSuccessRef.current = onSuccess;
  isPollingRef.current = isPolling;

  const pollSubscription = useCallback(async () => {
    try {
      // Invalidate and refetch usage details to get latest subscription data
      queryClient.invalidateQueries(["usageDetails"]);
      const result = await refetch();

      if (result.data) {
        // Check if subscription data looks updated (you may need to adjust this logic)
        const hasUpdatedPlan = result.data.plan === incomingPlan;

        if (hasUpdatedPlan) {
          setStatus({
            isPolling: false,
            isComplete: true,
            data: result.data,
            error: null,
          });
          onSuccessRef.current?.(result.data);
          return true; // Success
        }
      }
      return false; // Continue polling
    } catch (error) {
      console.error("Error polling subscription status:", error);
      setStatus((prev) => ({
        ...prev,
        isPolling: false,
        error: "Failed to verify subscription status. Please refresh the page.",
      }));
      return true; // Stop polling on error
    }
  }, [queryClient, refetch]);

  useEffect(() => {
    if (!isPolling) {
      setStatus((prev) => ({ ...prev, isPolling: false }));
      return;
    }

    setStatus((prev) => ({ ...prev, isPolling: true, error: null }));

    let pollCount = 0;
    let timeoutId: NodeJS.Timeout;
    let isCancelled = false;
    const maxPolls = Math.floor(maxPollingDuration / pollingInterval);

    const runPolling = async () => {
      if (isCancelled) return;

      const shouldStop = await pollSubscription();

      if (shouldStop || isCancelled) return;

      pollCount++;
      if (pollCount >= maxPolls) {
        // Stop polling after max duration
        if (!isCancelled) {
          setStatus((prev) => ({
            ...prev,
            isPolling: false,
            error: "Subscription verification timed out. Please refresh the page.",
          }));
        }
        return;
      }

      // Continue polling
      if (!isCancelled) {
        timeoutId = setTimeout(runPolling, pollingInterval);
      }
    };

    // Start polling
    runPolling();

    // Cleanup function
    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isPolling, pollingInterval, maxPollingDuration, pollSubscription]);

  return status;
};
