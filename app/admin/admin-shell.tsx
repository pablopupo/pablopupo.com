"use client";

import { useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import type { AdminRouteState } from "./admin-route";

type AdminTab =
  | "entries"
  | "work"
  | "graph"
  | "comments"
  | "analytics"
  | "profile"
  | "media";

const tabs = [
  { id: "entries", href: "/admin", label: "Entries" },
  { id: "work", href: "/admin/work", label: "Work" },
  { id: "graph", href: "/admin/graph", label: "Graph" },
  { id: "comments", href: "/admin/comments", label: "Comments" },
  { id: "analytics", href: "/admin/analytics", label: "Analytics" },
  { id: "profile", href: "/admin/profile", label: "Profile" },
  { id: "media", href: "/admin/media", label: "Media" },
] as const;

type AdminShellProps = {
  activeTab: AdminTab;
  description: string;
  children: ReactNode;
  beforeSignOut?: () => boolean;
};

function AdminStatePanel({ children }: { children: ReactNode }) {
  return (
    <section className="admin-state">
      {children}
      <style>{`
        .admin-state { max-width: 36rem; }
        .admin-state h2 { margin-top: 1.5rem; }
        .admin-state p { margin-bottom: 1rem; }
        .admin-state ul { margin: 1rem 0 1.5rem 1.25rem; }
        .admin-state button { font: 0.8125rem var(--mono); padding: 0.45rem 0.7rem; border: 1px solid var(--hairline); border-radius: 4px; background: var(--code-bg); color: var(--ink); cursor: pointer; }
        .admin-state button:disabled { opacity: 0.45; cursor: default; }
      `}</style>
    </section>
  );
}

export function AdminShell({
  activeTab,
  description,
  children,
  beforeSignOut = () => true,
}: AdminShellProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function signOut() {
    if (!beforeSignOut()) return;
    setBusy(true);
    setMessage("");
    try {
      await authClient.signOut();
      window.location.assign("/admin");
    } catch {
      setMessage("Could not sign out. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div>
          <h1>Admin</h1>
          <p className="admin-meta">{description}</p>
        </div>
        <button type="button" onClick={() => void signOut()} disabled={busy}>
          {busy ? "Signing out" : "Sign out"}
        </button>
      </header>
      <nav className="admin-tabs" aria-label="Admin sections">
        {tabs.map((tab) => (
          <a
            key={tab.id}
            href={tab.href}
            aria-current={activeTab === tab.id ? "page" : undefined}
          >
            {tab.label}
          </a>
        ))}
      </nav>
      {message && <p className="admin-message" role="status">{message}</p>}
      {children}
      <style>{`
        .admin-shell { width: min(70rem, calc(100vw - 2.5rem)); margin-left: 50%; transform: translateX(-50%); }
        .admin-header { display: flex; justify-content: space-between; align-items: start; gap: 1rem; }
        .admin-header h1 { margin-bottom: 0.2rem; }
        .admin-shell button { font: 0.8125rem var(--mono); padding: 0.45rem 0.7rem; border: 1px solid var(--hairline); border-radius: 4px; background: var(--code-bg); color: var(--ink); cursor: pointer; }
        .admin-shell button:disabled { opacity: 0.45; cursor: default; }
        .admin-tabs { display: flex; gap: 1.4rem; margin-top: 1.25rem; border-bottom: 1px solid var(--hairline); overflow-x: auto; }
        .admin-tabs a { flex: none; padding: 0 0 0.55rem; color: var(--muted); font: 0.75rem var(--mono); text-decoration: none; border-bottom: 1px solid transparent; margin-bottom: -1px; }
        .admin-tabs a:hover, .admin-tabs a[aria-current] { color: var(--ink); border-bottom-color: var(--ink); }
        .admin-meta { color: var(--muted); font: 0.75rem var(--mono); }
        .admin-message { margin-top: 0.75rem; color: var(--accent); font: 0.8125rem var(--mono); }
        @media (max-width: 760px) { .admin-shell { width: 100%; margin-left: 0; transform: none; } }
      `}</style>
    </div>
  );
}

export function AdminAccessState({ state }: { state: AdminRouteState }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (state.mode === "authorized") return null;

  if (state.mode === "unconfigured") {
    const { missing, invalid } = state.configurationStatus;
    return (
      <AdminStatePanel>
        <h1>Admin</h1>
        <h2>Admin configuration is incomplete</h2>
        <p>Set the following server environment variables before using the editor.</p>
        <ul>
          {[...missing, ...invalid].map((key) => (
            <li key={key}><code>{key}</code></li>
          ))}
        </ul>
      </AdminStatePanel>
    );
  }

  async function signIn() {
    setBusy(true);
    setMessage("");
    try {
      await authClient.signIn.social({
        provider: "github",
        callbackURL: window.location.pathname,
      });
    } catch {
      setMessage("Could not start GitHub sign-in. Try again.");
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setMessage("");
    try {
      await authClient.signOut();
      window.location.assign("/admin");
    } catch {
      setMessage("Could not sign out. Try again.");
      setBusy(false);
    }
  }

  if (state.mode === "signed-out") {
    return (
      <AdminStatePanel>
        <h1>Admin</h1>
        <p>Only the configured GitHub owner can manage this site.</p>
        <button type="button" onClick={() => void signIn()} disabled={busy}>
          Sign in with GitHub
        </button>
        {message && <p className="admin-message" role="status">{message}</p>}
      </AdminStatePanel>
    );
  }

  return (
    <AdminStatePanel>
      <h1>Admin</h1>
      <p>This GitHub account does not match the configured owner.</p>
      <button type="button" onClick={() => void signOut()} disabled={busy}>
        Sign out
      </button>
      {message && <p className="admin-message" role="status">{message}</p>}
    </AdminStatePanel>
  );
}
