import { CopyIcon } from "@radix-ui/react-icons";

import { Badge } from "@/components/ui/badge";

import { copyText } from "@/utils/toasts";

export function ProxyBadge({ proxy }: { proxy: string }) {
  return (
    <Badge
      variant="secondary"
      className="text-[var(--sand-11)] bg-[var(--sand-a3)] gap-2 py-1 px-3 flex items-center justify-between max-w-fit	"
    >
      {proxy}
      <CopyIcon
        className="cursor-pointer text-[var(--sand-11)] hover:text-[var(--sand-12)] active:text-[var(--sand-10)]"
        width={16}
        height={16}
        onClick={() => copyText(proxy, "Proxy IP")}
      />
    </Badge>
  );
}
