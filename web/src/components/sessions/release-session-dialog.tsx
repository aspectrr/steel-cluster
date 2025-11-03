import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { useSessionsContext } from "@/hooks/use-sessions-context";

export const ReleaseSessionDialog = ({
  children,
  id,
}: {
  id: string;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const { useReleaseSessionMutation } = useSessionsContext();

  const { mutate: releaseSession, isLoading, isSuccess } = useReleaseSessionMutation();

  useEffect(() => {
    if (isSuccess) {
      setOpen(false);
    }
  }, [isSuccess]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent className="sm:max-w-[425px] bg-[var(--sand-2)] border-[var(--sand-6)] text-[var(--sand-12)]">
        <DialogHeader>
          <DialogTitle>Are you absolutely sure?</DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will release your session and delete all your session
            data.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {!isLoading && (
            <Button
              variant="outline"
              className="text-[var(--sand-12)] bg-[var(--sand-3)]"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            variant="outline"
            className="text-[var(--red-11)] border-[var(--red-7)] hover:bg-[var(--red-3)]"
            disabled={isLoading}
            onClick={() => {
              releaseSession(id);
            }}
          >
            {isLoading ? "Releasing Session..." : "Release Session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
