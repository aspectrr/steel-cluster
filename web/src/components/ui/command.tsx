import { JSX } from "react";
import { useState } from "react";
import { CheckIcon, CopyIcon } from "@radix-ui/react-icons";

interface CommandProps {
  command: string;
  actualCommand?: string; // The actual command to copy (with real API key)
  output?: string;
  className?: string;
}

export function Command({ command, actualCommand, className = "" }: CommandProps): JSX.Element {
  const [showCheck, setShowCheck] = useState(false);

  const copyToClipboard = () => {
    // Use actualCommand for copying if provided, otherwise use displayed command
    navigator.clipboard.writeText(actualCommand || command);
    setShowCheck(true);
    setTimeout(() => {
      setShowCheck(false);
    }, 1000);
  };

  // Simple split by newline
  const commandLines = command.split("\n");
  const isSingleLine = commandLines.length === 1;

  return (
    <div className={`rounded-lg border border-[var(--sand-3)] bg-[var(--sand-2)] ${className}`}>
      <div className={`p-2 flex ${isSingleLine ? "items-center" : "items-start"} justify-between`}>
        <div className="flex-1 font-mono text-sm">
          {commandLines.map((line, index) => (
            <div key={index} className="text-[var(--sand-12)]">
              {line}
            </div>
          ))}
        </div>
        <button
          onClick={copyToClipboard}
          className="text-[var(--sand-11)] p-2 h-fit border rounded-md border-[var(--sand-2)] hover:text-[var(--sand-12)] hover:border-[var(--sand-3)] transition-colors relative"
          aria-label="Copy command"
        >
          <span
            className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${
              showCheck ? "opacity-100 scale-100" : "opacity-0 scale-50"
            }`}
          >
            <CheckIcon className="text-[var(--sand-12)]" />
          </span>
          <span
            className={`flex items-center justify-center transition-all duration-300 ${
              showCheck ? "opacity-0 scale-50" : "opacity-100 scale-100"
            }`}
          >
            <CopyIcon />
          </span>
        </button>
      </div>
    </div>
  );
}
