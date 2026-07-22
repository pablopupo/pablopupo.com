"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "./admin-shell";

export type MediaPurpose = "profile" | "resume" | "content";

export type AdminMedia = {
  id: string;
  url: string;
  mimeType: string;
  altText: string | null;
  width: number | null;
  height: number | null;
  byteSize: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type MediaUpload = {
  file: File;
  altText: string;
  purpose: MediaPurpose;
};

type MediaUploadResult =
  | { status: "uploaded"; media: AdminMedia }
  | { status: "error"; message: string };

const supportedMediaTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "application/pdf",
]);

function normalizeMedia(value: Record<string, unknown>): AdminMedia {
  return {
    id: typeof value.id === "string" ? value.id : "",
    url: typeof value.url === "string" ? value.url : "",
    mimeType: typeof value.mimeType === "string" ? value.mimeType : "",
    altText: typeof value.altText === "string" ? value.altText : null,
    width: typeof value.width === "number" ? value.width : null,
    height: typeof value.height === "number" ? value.height : null,
    byteSize: typeof value.byteSize === "number" ? value.byteSize : 0,
    metadata:
      value.metadata && typeof value.metadata === "object"
        ? (value.metadata as Record<string, unknown>)
        : null,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
  };
}

async function readPayload(response: Response) {
  return response.json().catch(() => null) as Promise<{
    error?: string;
    media?: Record<string, unknown> | Record<string, unknown>[];
  } | null>;
}

export function validateMediaUpload(
  file: File,
  altText: string,
  purpose: MediaPurpose
) {
  if (!supportedMediaTypes.has(file.type)) {
    return "Choose a JPEG, PNG, WebP, AVIF, or PDF file";
  }
  if (file.type.startsWith("image/") && !altText.trim()) {
    return "Describe this image before uploading it";
  }
  if (purpose === "profile" && !file.type.startsWith("image/")) {
    return "A profile portrait must be an image";
  }
  if (purpose === "resume" && file.type !== "application/pdf") {
    return "A resume must be a PDF";
  }
  return null;
}

export async function uploadMedia(
  upload: MediaUpload,
  fetcher: typeof fetch = fetch
): Promise<MediaUploadResult> {
  const validationError = validateMediaUpload(
    upload.file,
    upload.altText,
    upload.purpose
  );
  if (validationError) return { status: "error", message: validationError };

  const body = new FormData();
  body.set("file", upload.file);
  body.set("altText", upload.altText.trim());
  body.set("purpose", upload.purpose);
  try {
    const response = await fetcher("/api/admin/media", {
      method: "POST",
      body,
    });
    const payload = await readPayload(response);
    if (!response.ok || !payload?.media || Array.isArray(payload.media)) {
      return {
        status: "error",
        message: payload?.error ?? `Could not upload media (${response.status})`,
      };
    }
    return { status: "uploaded", media: normalizeMedia(payload.media) };
  } catch {
    return { status: "error", message: "Network request failed" };
  }
}

export function formatByteSize(byteSize: number) {
  if (byteSize < 1024) return `${byteSize} B`;
  if (byteSize < 1024 * 1024) {
    return `${Number((byteSize / 1024).toFixed(1))} KB`;
  }
  return `${Number((byteSize / (1024 * 1024)).toFixed(1))} MB`;
}

function dimensions(media: AdminMedia) {
  return media.width && media.height ? `${media.width} × ${media.height}` : "Not applicable";
}

export default function MediaManager() {
  const [media, setMedia] = useState<AdminMedia[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadMedia() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/media", { cache: "no-store" });
      const payload = await readPayload(response);
      if (!response.ok || !Array.isArray(payload?.media)) {
        setMessage(payload?.error ?? `Could not load media (${response.status})`);
        return;
      }
      setMedia(payload.media.map(normalizeMedia));
    } catch {
      setMessage("Network request failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMedia();
  }, []);

  async function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setMessage("Choose a file before uploading it");
      return;
    }
    const validationError = validateMediaUpload(file, altText, "content");
    if (validationError) {
      setMessage(validationError);
      return;
    }

    setUploading(true);
    setMessage("");
    const result = await uploadMedia({ file, altText, purpose: "content" });
    if (result.status === "uploaded") {
      setMedia((current) => [result.media, ...current]);
      setFile(null);
      setAltText("");
      setMessage("Media uploaded");
    } else {
      setMessage(result.message);
    }
    setUploading(false);
  }

  return (
    <AdminShell activeTab="media" description="Images and documents">
      <div className="media-admin">
        <form className="media-upload" onSubmit={(event) => void submitUpload(event)}>
          <div>
            <h2>Upload content media</h2>
            <p>Choose an image for an entry or a PDF document.</p>
          </div>
          <label>
            Image or PDF
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,application/pdf"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setMessage("");
              }}
              disabled={uploading}
            />
          </label>
          <label>
            Alt text
            <input
              value={altText}
              onChange={(event) => {
                setAltText(event.target.value);
                setMessage("");
              }}
              required={Boolean(file?.type.startsWith("image/"))}
              disabled={uploading}
              placeholder="What is visible in the image?"
            />
          </label>
          <input type="hidden" name="purpose" value="content" />
          <button type="submit" disabled={uploading || !file}>
            {uploading ? "Uploading media" : "Upload media"}
          </button>
          {uploading && <progress aria-label="Uploading media" />}
        </form>

        <section className="media-library" aria-busy={loading}>
          <div className="media-library-heading">
            <h2>Media library</h2>
            <button type="button" onClick={() => void loadMedia()} disabled={loading || uploading}>
              Reload
            </button>
          </div>
          {media.length === 0 ? (
            <p className="admin-meta">
              {loading ? "Loading media" : "No media loaded yet"}
            </p>
          ) : (
            <ul>
              {media.map((item) => (
                <li key={item.id}>
                  {item.mimeType.startsWith("image/") && (
                    <img src={item.url} alt={item.altText ?? ""} />
                  )}
                  <div>
                    <a href={item.url} target="_blank" rel="noreferrer">
                      {item.url}
                    </a>
                    <dl>
                      <div><dt>MIME</dt><dd>{item.mimeType}</dd></div>
                      <div><dt>Dimensions</dt><dd>{dimensions(item)}</dd></div>
                      <div><dt>Size</dt><dd>{formatByteSize(item.byteSize)}</dd></div>
                      <div><dt>Created</dt><dd>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "Unknown"}</dd></div>
                    </dl>
                    {item.altText && <p>Alt: {item.altText}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        {message && <p className="admin-message" role="status">{message}</p>}
      </div>
      <style>{`
        .media-admin { display: grid; grid-template-columns: minmax(16rem, 0.7fr) minmax(0, 1.5fr); gap: 2rem; margin-top: 1.5rem; }
        .media-upload, .media-library { display: grid; align-content: start; gap: 0.9rem; }
        .media-upload h2, .media-library h2 { margin: 0; font-size: 1.1rem; }
        .media-upload p { color: var(--muted); font-size: 0.95rem; }
        .media-upload label { display: grid; gap: 0.3rem; color: var(--muted); font: 0.75rem var(--mono); }
        .media-upload input { width: 100%; padding: 0.5rem 0.6rem; border: 1px solid var(--hairline); border-radius: 4px; color: var(--ink); background: var(--bg); font: inherit; }
        .media-upload progress { width: 100%; }
        .media-library-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
        .media-library ul { display: grid; gap: 0; list-style: none; border-top: 1px solid var(--hairline); }
        .media-library li { display: grid; grid-template-columns: 7rem minmax(0, 1fr); gap: 1rem; padding: 1rem 0; border-bottom: 1px solid var(--hairline); }
        .media-library li > div { min-width: 0; }
        .media-library img { width: 7rem; height: 5rem; object-fit: cover; border: 1px solid var(--hairline); }
        .media-library a { display: block; overflow-wrap: anywhere; font: 0.75rem/1.45 var(--mono); }
        .media-library dl { display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; margin-top: 0.55rem; font: 0.7rem var(--mono); color: var(--muted); }
        .media-library dl div { display: flex; gap: 0.35rem; }
        .media-library dt { color: var(--ink); }
        .media-library p { margin-top: 0.45rem; color: var(--muted); font-size: 0.9rem; }
        @media (max-width: 760px) { .media-admin { grid-template-columns: 1fr; } .media-library li { grid-template-columns: 5rem minmax(0, 1fr); } .media-library img { width: 5rem; height: 4rem; } }
      `}</style>
    </AdminShell>
  );
}
