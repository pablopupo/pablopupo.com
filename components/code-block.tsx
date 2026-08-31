"use client";

import { useState } from "react";

export type CopyStatus = "idle" | "copied" | "failed";

type ClipboardWriter = {
  writeText: (text: string) => Promise<void>;
};

export function copyButtonLabel(status: CopyStatus) {
  if (status === "copied") return "Copied";
  if (status === "failed") return "Copy failed";
  return "Copy";
}

export async function copyCode(
  code: string,
  clipboard: ClipboardWriter | undefined =
    typeof navigator === "undefined" ? undefined : navigator.clipboard
): Promise<CopyStatus> {
  if (!clipboard) return "failed";
  try {
    await clipboard.writeText(code);
    return "copied";
  } catch {
    return "failed";
  }
}

export default function CodeBlock({
  code,
  language,
}: {
  code: string;
  language?: string;
}) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const safeLanguage = language?.replace(/[^A-Za-z0-9_+-]/g, "");

  return (
    <div className="code-block">
      <button
        className="code-copy-button"
        type="button"
        onClick={async () => setStatus(await copyCode(code))}
      >
        <span aria-live="polite">{copyButtonLabel(status)}</span>
      </button>
      <pre>
        <code className={safeLanguage ? `language-${safeLanguage}` : undefined}>
          {code}
        </code>
      </pre>
    </div>
  );
}
