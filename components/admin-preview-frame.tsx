import type { ReactNode } from "react";

type AdminPreviewFrameProps = {
  label: ReactNode;
  editorHref: string;
  children: ReactNode;
};

export function AdminPreviewFrame({
  label,
  editorHref,
  children,
}: AdminPreviewFrameProps) {
  return (
    <>
      <aside className="admin-preview-frame" aria-label="Preview status">
        <div className="admin-preview-context">
          <strong>Owner-only preview</strong>
          <span>{label}</span>
        </div>
        <a href={editorHref}>Back to editor</a>
      </aside>
      {children}
      <style>{`
        .admin-preview-frame {
          position: sticky;
          top: 0.75rem;
          z-index: 15;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin: -1.5rem 0 2.5rem;
          padding: 0.7rem 0.8rem;
          border: 1px solid var(--hairline);
          border-left: 3px solid var(--accent);
          border-radius: 4px;
          background: color-mix(in srgb, var(--surface) 94%, transparent);
          box-shadow: 0 0.35rem 1.25rem var(--panel-shadow);
          backdrop-filter: blur(12px);
        }

        .admin-preview-context {
          min-width: 0;
          display: flex;
          align-items: baseline;
          gap: 0.65rem;
        }

        .admin-preview-context strong {
          flex: none;
          font: 600 0.7rem/1.2 var(--mono);
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .admin-preview-context span {
          min-width: 0;
          overflow: hidden;
          color: var(--muted);
          font: 0.75rem/1.35 var(--mono);
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .admin-preview-frame > a {
          flex: none;
          font: 0.75rem/1.35 var(--mono);
          white-space: nowrap;
        }

        @media (max-width: 560px) {
          .admin-preview-frame {
            align-items: flex-start;
            flex-direction: column;
            gap: 0.35rem;
          }

          .admin-preview-context {
            width: 100%;
            align-items: flex-start;
            flex-direction: column;
            gap: 0.2rem;
          }

          .admin-preview-context span {
            width: 100%;
          }
        }
      `}</style>
    </>
  );
}
