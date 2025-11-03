import { JSX } from "react";
import { useState } from "react";
import { CheckIcon, CopyIcon } from "@radix-ui/react-icons";

interface PlainTextProps {
  text: string;
  className?: string;
}

export function PlainText({ text, className = "" }: PlainTextProps): JSX.Element {
  const [showCheck, setShowCheck] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(text);
    setShowCheck(true);
    setTimeout(() => {
      setShowCheck(false);
    }, 1000);
  };

  return (
    <div className={`rounded-lg border border-[var(--sand-3)] bg-[var(--sand-2)] ${className}`}>
      <div className="p-2">
        <div className="flex items-center gap-2 relative pl-2">
          <div className="flex-1 text-sm font-mono font-normal text-[var(--sand-12)] pr-6 whitespace-pre-wrap overflow-x-auto">
            {text.split("\n").map((line, index) => (
              <div key={index} className="min-h-[1.5em]">
                {line}
              </div>
            ))}
          </div>
          <button
            onClick={copyToClipboard}
            className="text-[var(--sand-11)] p-2 border rounded-md border-[var(--sand-2)] hover:text-[var(--sand-12)] hover:border-[var(--sand-3)] transition-colors relative"
            aria-label="Copy text"
          >
            <span
              className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${showCheck ? "opacity-100 scale-100" : "opacity-0 scale-50"}`}
            >
              <CheckIcon className="text-[var(--sand-12)]" />
            </span>
            <span
              className={`flex items-center justify-center transition-all duration-300 ${showCheck ? "opacity-0 scale-50" : "opacity-100 scale-100"}`}
            >
              <CopyIcon />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
