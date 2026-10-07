"use client";

import { useEffect, useState, type ReactNode } from "react";

export default function CopyEmail({ email, label = "Email", icon }: { email: string; label?: string; icon?: ReactNode }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (status !== "copied") return;
    const timer = window.setTimeout(() => setStatus("idle"), 4000);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(email);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  return <span className={`email-copy${icon ? " email-copy-icon" : ""}`} data-status={status}>
    <button type="button" className="email-copy-button" aria-label="Copy email address" onClick={copy}>
      {icon && status === "copied" ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg> : icon ?? label}
    </button>
    {status === "idle" && <span className="email-copy-hint" aria-hidden="true">Copy email</span>}
    <span className="email-copy-feedback" role="status">{status === "copied" ? "Email copied" : status === "failed" ? <>Couldn’t copy. Select the address: <span className="email-copy-address">{email}</span></> : ""}</span>
  </span>;
}
