import { CopyIcon, DesktopIcon } from "@radix-ui/react-icons";
import UAParser from "ua-parser-js";

import { ChromeIcon } from "@/components/icons/ChromeIcon";
import { Badge } from "@/components/ui/badge";

import { copyText } from "@/utils/toasts";
export function UserAgentBadge({ userAgent }: { userAgent: string }) {
  const parser = new UAParser(userAgent);

  return (
    <Badge
      variant="secondary"
      className="text-[var(--sand-11)] bg-[var(--sand-a3)] gap-2 py-1 px-3 flex items-center justify-between max-w-fit"
    >
      <DesktopIcon width={16} height={16} color="var(--sand-11)" />{" "}
      {parser.getDevice().type || "Desktop"}
      <ChromeIcon width={16} height={16} color="var(--sand-11)" />{" "}
      {`${parser.getBrowser().name} (v${parser.getBrowser().version})`}
      <CopyIcon
        width={16}
        height={16}
        className="cursor-pointer text-[var(--sand-11)] hover:text-[var(--sand-12)] active:text-[var(--sand-10)]"
        onClick={() => copyText(userAgent, "User Agent")}
      />
    </Badge>
  );
}
