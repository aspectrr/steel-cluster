import { Link } from "react-router-dom";
import { ArrowTopRightIcon } from "@radix-ui/react-icons";

import { Globe } from "@/components/illustrations/globe";

interface EmptyStateProps {
  expired?: boolean;
}

export function EmptyState({ expired }: EmptyStateProps) {
  return (
    <div className="flex flex-col w-full flex-1 px-24 pt-10 bg-[url('/grid.svg')] bg-no-repeat bg-center border-[var(--sand-3)] bg-cover items-center">
      <div className="flex flex-col gap-4 max-w-[396px] mx-auto">
        <div className="flex flex-col gap-4 mt-10  justify-center items-center mx-auto">
          <h1 className="text-[var(--sand-12)] text-2xl font-medium text-center">
            This session has {expired ? "expired!" : "no events!"}
          </h1>
          <p className="text-[var(--sand-11)] text-lg text-center max-w-[380px]">
            {expired ? (
              "It has reached the end of its retention period and is no longer available."
            ) : (
              <>
                <span>
                  If you're using Playwright, make sure you're using the{" "}
                  <a
                    href="https://docs.steel.dev/overview/guides/connect-with-playwright-node#method-2-create-and-connect"
                    target="_blank"
                    className="underline"
                  >
                    existing context
                  </a>{" "}
                  to capture recordings.
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex justify-center items-center w-full">
          <Globe />
        </div>
        <div className="flex flex-col gap-2 justify-center items-center">
          <p className="text-[var(--sand-11)] text-lg text-center max-w-[280px]">
            If you think this is an error, message us on Discord.
          </p>
          <Link
            to="https://discord.gg/gPpvhNvc5R"
            target="_blank"
            className="flex items-center py-2 gap-1 text-[var(--indigo-11)] text-sm hover:text-[var(--indigo-12)] cursor-pointer"
          >
            Go to Discord
            <ArrowTopRightIcon width={16} height={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}
