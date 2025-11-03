import { JSX } from "react";

interface InlineCodeProps {
  code: string;
}

export function InlineCode({ code }: InlineCodeProps): JSX.Element {
  return (
    <code className="inline-block px-1 py-0.1 mx-0.25 rounded bg-[var(--sand-2)] border border-[var(--sand-3)] font-mono text-[0.9em] text-[var(--sand-12)]">
      {code}
    </code>
  );
}
