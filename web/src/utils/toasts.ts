import { toast } from "@/hooks/use-toast";

export const copyText = (text: string, valueCopied?: string) => {
  navigator.clipboard.writeText(text);
  toast({
    title: valueCopied ? `${valueCopied} copied to clipboard` : "Text copied to clipboard",
    className: "border border-[var(--sand-3)] text-normal text-[var(--sand-12)] px-8 py-6",
    duration: 700,
  });
};
