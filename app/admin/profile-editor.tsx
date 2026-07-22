"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "./admin-shell";
import {
  uploadMedia,
  validateMediaUpload,
  type AdminMedia,
  type MediaPurpose,
} from "./media-manager";

export type ProfileSettings = {
  siteTitle: string;
  headline: string;
  location: string | null;
  graduationOn: string | null;
  introMarkdown: string;
  aboutMarkdown: string;
  contactEmail: string | null;
  githubUrl: string | null;
  linkedinUrl: string | null;
  youtubeUrl: string | null;
  avatarMediaId: string | null;
  resumeMediaId: string | null;
  version: number;
};

type EditableProfileSettings = Omit<ProfileSettings, "version">;

type ProfileSaveResult =
  | { status: "saved"; settings: ProfileSettings }
  | { status: "conflict"; message: string }
  | { status: "error"; message: string };

type ProfileStatus =
  | "loading"
  | "saved"
  | "saving"
  | "conflict"
  | "error";

const blankSettings: ProfileSettings = {
  siteTitle: "",
  headline: "",
  location: "",
  graduationOn: "",
  introMarkdown: "",
  aboutMarkdown: "",
  contactEmail: "",
  githubUrl: "",
  linkedinUrl: "",
  youtubeUrl: "",
  avatarMediaId: null,
  resumeMediaId: null,
  version: 0,
};

function nullable(value: string | null) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function normalizeSettings(value: Record<string, unknown>): ProfileSettings {
  const stringOrNull = (field: unknown) =>
    typeof field === "string" ? field : null;
  return {
    siteTitle: typeof value.siteTitle === "string" ? value.siteTitle : "",
    headline: typeof value.headline === "string" ? value.headline : "",
    location: stringOrNull(value.location),
    graduationOn: stringOrNull(value.graduationOn)?.slice(0, 10) ?? null,
    introMarkdown:
      typeof value.introMarkdown === "string" ? value.introMarkdown : "",
    aboutMarkdown:
      typeof value.aboutMarkdown === "string" ? value.aboutMarkdown : "",
    contactEmail: stringOrNull(value.contactEmail),
    githubUrl: stringOrNull(value.githubUrl),
    linkedinUrl: stringOrNull(value.linkedinUrl),
    youtubeUrl: stringOrNull(value.youtubeUrl),
    avatarMediaId: stringOrNull(value.avatarMediaId),
    resumeMediaId: stringOrNull(value.resumeMediaId),
    version: typeof value.version === "number" ? value.version : 0,
  };
}

function editableSettings(settings: ProfileSettings): EditableProfileSettings {
  return {
    siteTitle: settings.siteTitle.trim(),
    headline: settings.headline.trim(),
    location: nullable(settings.location),
    graduationOn: nullable(settings.graduationOn),
    introMarkdown: settings.introMarkdown,
    aboutMarkdown: settings.aboutMarkdown,
    contactEmail: nullable(settings.contactEmail),
    githubUrl: nullable(settings.githubUrl),
    linkedinUrl: nullable(settings.linkedinUrl),
    youtubeUrl: nullable(settings.youtubeUrl),
    avatarMediaId: settings.avatarMediaId,
    resumeMediaId: settings.resumeMediaId,
  };
}

export function createSettingsPatch(settings: ProfileSettings) {
  return {
    expectedVersion: settings.version,
    settings: editableSettings(settings),
  };
}

export function profileStatusAfterEdit(status: ProfileStatus): ProfileStatus {
  return status === "conflict" ? "conflict" : "saved";
}

export function profileMessageAfterEdit(_message: string) {
  return "";
}

export function isProfileFormBusy(
  status: ProfileStatus,
  version: number,
  uploading: MediaPurpose | null
) {
  return (
    status === "loading" ||
    status === "saving" ||
    uploading !== null ||
    (status === "error" && version === 0)
  );
}

async function profilePayload(response: Response) {
  return response.json().catch(() => null) as Promise<{
    error?: string;
    settings?: Record<string, unknown>;
    media?: Record<string, unknown>[];
  } | null>;
}

export async function saveProfileSettings(
  settings: ProfileSettings,
  fetcher: typeof fetch = fetch
): Promise<ProfileSaveResult> {
  try {
    const response = await fetcher("/api/admin/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(createSettingsPatch(settings)),
    });
    const payload = await profilePayload(response);
    if (response.status === 409) {
      return {
        status: "conflict",
        message: payload?.error ?? "Profile settings changed elsewhere",
      };
    }
    if (!response.ok || !payload?.settings) {
      return {
        status: "error",
        message: payload?.error ?? `Could not save profile (${response.status})`,
      };
    }
    return { status: "saved", settings: normalizeSettings(payload.settings) };
  } catch {
    return { status: "error", message: "Network request failed" };
  }
}

function isImage(media: AdminMedia) {
  return media.mimeType.startsWith("image/");
}

function isPdf(media: AdminMedia) {
  return media.mimeType === "application/pdf";
}

export default function ProfileEditor() {
  const [settings, setSettings] = useState<ProfileSettings>(blankSettings);
  const [media, setMedia] = useState<AdminMedia[]>([]);
  const [portraitFile, setPortraitFile] = useState<File | null>(null);
  const [portraitAlt, setPortraitAlt] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ProfileStatus>("loading");
  const [uploading, setUploading] = useState<MediaPurpose | null>(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");

  async function loadProfile() {
    setStatus("loading");
    setMessage("");
    try {
      const [settingsResponse, mediaResponse] = await Promise.all([
        fetch("/api/admin/settings", { cache: "no-store" }),
        fetch("/api/admin/media", { cache: "no-store" }),
      ]);
      const [settingsPayload, mediaPayload] = await Promise.all([
        profilePayload(settingsResponse),
        profilePayload(mediaResponse),
      ]);
      if (!settingsResponse.ok || !settingsPayload?.settings) {
        setStatus("error");
        setMessage(
          settingsPayload?.error ??
            `Could not load profile (${settingsResponse.status})`
        );
        return;
      }
      if (!mediaResponse.ok || !Array.isArray(mediaPayload?.media)) {
        setStatus("error");
        setMessage(
          mediaPayload?.error ?? `Could not load media (${mediaResponse.status})`
        );
        return;
      }
      setSettings(normalizeSettings(settingsPayload.settings));
      setMedia(
        mediaPayload.media.map((item) => ({
          id: typeof item.id === "string" ? item.id : "",
          url: typeof item.url === "string" ? item.url : "",
          mimeType: typeof item.mimeType === "string" ? item.mimeType : "",
          altText: typeof item.altText === "string" ? item.altText : null,
          width: typeof item.width === "number" ? item.width : null,
          height: typeof item.height === "number" ? item.height : null,
          byteSize: typeof item.byteSize === "number" ? item.byteSize : 0,
          metadata:
            item.metadata && typeof item.metadata === "object"
              ? (item.metadata as Record<string, unknown>)
              : null,
          createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
        }))
      );
      setDirty(false);
      setStatus("saved");
    } catch {
      setStatus("error");
      setMessage("Network request failed");
    }
  }

  useEffect(() => {
    void loadProfile();
  }, []);

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  function updateSettings(changes: Partial<ProfileSettings>) {
    setSettings((current) => ({ ...current, ...changes }));
    setDirty(true);
    setStatus((current) => profileStatusAfterEdit(current));
    setMessage((current) => profileMessageAfterEdit(current));
  }

  async function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");
    const result = await saveProfileSettings(settings);
    if (result.status === "saved") {
      setSettings(result.settings);
      setDirty(false);
      setStatus("saved");
      setMessage("Profile saved");
      return;
    }
    setStatus(result.status);
    setMessage(result.message);
  }

  async function uploadReplacement(purpose: "profile" | "resume") {
    const file = purpose === "profile" ? portraitFile : resumeFile;
    const altText = purpose === "profile" ? portraitAlt : "";
    if (!file) {
      setMessage(
        purpose === "profile" ? "Choose a portrait" : "Choose a resume PDF"
      );
      return;
    }
    const validationError = validateMediaUpload(file, altText, purpose);
    if (validationError) {
      setMessage(validationError);
      return;
    }

    setUploading(purpose);
    setMessage("");
    const result = await uploadMedia({ file, altText, purpose });
    if (result.status === "uploaded") {
      setMedia((current) => [result.media, ...current]);
      updateSettings(
        purpose === "profile"
          ? { avatarMediaId: result.media.id }
          : { resumeMediaId: result.media.id }
      );
      if (purpose === "profile") {
        setPortraitFile(null);
        setPortraitAlt("");
      } else {
        setResumeFile(null);
      }
      setMessage(
        purpose === "profile"
          ? "Portrait uploaded and selected. Save the profile to publish it."
          : "Resume uploaded and selected. Save the profile to publish it."
      );
    } else {
      setMessage(result.message);
    }
    setUploading(null);
  }

  const portrait = media.find((item) => item.id === settings.avatarMediaId);
  const resume = media.find((item) => item.id === settings.resumeMediaId);
  const formBusy = isProfileFormBusy(status, settings.version, uploading);
  const initialLoadFailed = status === "error" && settings.version === 0;

  return (
    <AdminShell
      activeTab="profile"
      description="Public identity and contact details"
      beforeSignOut={() =>
        !dirty || window.confirm("Discard unsaved profile changes?")
      }
    >
      <form className="profile-admin" onSubmit={(event) => void submitSettings(event)}>
        <section className="profile-fields">
          <div className="profile-section-heading">
            <div>
              <h2>Profile</h2>
              <p>These details appear across the public site.</p>
            </div>
            <span className="admin-meta">Version {settings.version || "new"}</span>
          </div>
          <div className="profile-grid">
            <label>Site title<input required value={settings.siteTitle} onChange={(event) => updateSettings({ siteTitle: event.target.value })} disabled={formBusy} /></label>
            <label>Headline<input required value={settings.headline} onChange={(event) => updateSettings({ headline: event.target.value })} disabled={formBusy} /></label>
            <label>Location<input value={settings.location ?? ""} onChange={(event) => updateSettings({ location: event.target.value })} disabled={formBusy} /></label>
            <label>Graduation date<input type="date" value={settings.graduationOn ?? ""} onChange={(event) => updateSettings({ graduationOn: event.target.value })} disabled={formBusy} /></label>
            <label>Contact email<input type="email" value={settings.contactEmail ?? ""} onChange={(event) => updateSettings({ contactEmail: event.target.value })} disabled={formBusy} /></label>
            <label>GitHub URL<input type="url" value={settings.githubUrl ?? ""} onChange={(event) => updateSettings({ githubUrl: event.target.value })} disabled={formBusy} /></label>
            <label>LinkedIn URL<input type="url" value={settings.linkedinUrl ?? ""} onChange={(event) => updateSettings({ linkedinUrl: event.target.value })} disabled={formBusy} /></label>
            <label>YouTube URL<input type="url" value={settings.youtubeUrl ?? ""} onChange={(event) => updateSettings({ youtubeUrl: event.target.value })} disabled={formBusy} /></label>
          </div>
          <label>Introduction<textarea rows={5} value={settings.introMarkdown} onChange={(event) => updateSettings({ introMarkdown: event.target.value })} disabled={formBusy} /></label>
          <label>About<textarea rows={14} value={settings.aboutMarkdown} onChange={(event) => updateSettings({ aboutMarkdown: event.target.value })} disabled={formBusy} /></label>
        </section>

        <section className="profile-assets">
          <h2>Portrait and resume</h2>
          <div className="profile-asset">
            <div className="profile-preview portrait-preview">
              {portrait ? (
                <img src={portrait.url} alt={portrait.altText ?? "Current portrait"} />
              ) : (
                <span>No portrait selected</span>
              )}
            </div>
            <label>
              Portrait
              <select value={settings.avatarMediaId ?? ""} onChange={(event) => updateSettings({ avatarMediaId: event.target.value || null })} disabled={formBusy}>
                <option value="">No portrait</option>
                {media.filter(isImage).map((item) => (
                  <option key={item.id} value={item.id}>{item.altText || item.url}</option>
                ))}
              </select>
            </label>
            <label>New portrait<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => { setPortraitFile(event.target.files?.[0] ?? null); setMessage(""); }} disabled={formBusy} /></label>
            <label>Portrait alt text<input value={portraitAlt} onChange={(event) => { setPortraitAlt(event.target.value); setMessage(""); }} required={Boolean(portraitFile)} disabled={formBusy} /></label>
            <button type="button" onClick={() => void uploadReplacement("profile")} disabled={formBusy || !portraitFile}>
              {uploading === "profile" ? "Uploading portrait" : "Upload portrait"}
            </button>
            {uploading === "profile" && <progress aria-label="Uploading portrait" />}
          </div>

          <div className="profile-asset">
            <div className="profile-preview resume-preview">
              {resume ? (
                <a href={resume.url} target="_blank" rel="noreferrer">View current resume</a>
              ) : (
                <span>No resume selected</span>
              )}
            </div>
            <label>
              Resume
              <select value={settings.resumeMediaId ?? ""} onChange={(event) => updateSettings({ resumeMediaId: event.target.value || null })} disabled={formBusy}>
                <option value="">No resume</option>
                {media.filter(isPdf).map((item) => (
                  <option key={item.id} value={item.id}>{item.url}</option>
                ))}
              </select>
            </label>
            <label>New resume PDF<input type="file" accept="application/pdf" onChange={(event) => { setResumeFile(event.target.files?.[0] ?? null); setMessage(""); }} disabled={formBusy} /></label>
            <button type="button" onClick={() => void uploadReplacement("resume")} disabled={formBusy || !resumeFile}>
              {uploading === "resume" ? "Uploading resume" : "Upload resume"}
            </button>
            {uploading === "resume" && <progress aria-label="Uploading resume" />}
          </div>
        </section>

        <div className="profile-actions">
          <button type="submit" disabled={formBusy || status === "conflict" || !dirty || !settings.siteTitle || !settings.headline}>
            {status === "saving" ? "Saving profile" : "Save profile"}
          </button>
          {status === "conflict" && (
            <button type="button" onClick={() => void loadProfile()} disabled={formBusy}>
              Reload server version
            </button>
          )}
          {initialLoadFailed && (
            <button type="button" onClick={() => void loadProfile()}>
              Retry load
            </button>
          )}
          <span className="admin-meta">
            {status === "loading"
              ? "Loading profile"
              : initialLoadFailed
                ? "Profile unavailable"
                : status === "conflict"
                  ? "Server version changed"
                  : dirty
                    ? "Unsaved changes"
                    : "Saved"}
          </span>
        </div>
        {message && <p className="admin-message" role="status">{message}</p>}
      </form>
      <style>{`
        .profile-admin { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(16rem, 0.75fr); gap: 2rem; margin-top: 1.5rem; }
        .profile-fields, .profile-assets { display: grid; align-content: start; gap: 0.9rem; }
        .profile-section-heading { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
        .profile-admin h2 { margin: 0; font-size: 1.1rem; }
        .profile-section-heading p { color: var(--muted); font-size: 0.95rem; }
        .profile-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
        .profile-admin label { display: grid; gap: 0.3rem; color: var(--muted); font: 0.75rem var(--mono); }
        .profile-admin input, .profile-admin select, .profile-admin textarea { width: 100%; padding: 0.5rem 0.6rem; border: 1px solid var(--hairline); border-radius: 4px; color: var(--ink); background: var(--bg); font: inherit; }
        .profile-admin textarea { resize: vertical; font-family: var(--mono); line-height: 1.55; }
        .profile-assets { border-left: 1px solid var(--hairline); padding-left: 1.5rem; }
        .profile-asset { display: grid; gap: 0.65rem; padding-bottom: 1.2rem; border-bottom: 1px solid var(--hairline); }
        .profile-preview { display: grid; place-items: center; min-height: 7rem; border: 1px solid var(--hairline); color: var(--muted); font: 0.75rem var(--mono); }
        .portrait-preview { min-height: 13rem; }
        .portrait-preview img { width: 100%; height: 16rem; object-fit: cover; object-position: center 30%; }
        .profile-asset progress { width: 100%; }
        .profile-actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 0.7rem; padding-top: 1rem; border-top: 1px solid var(--hairline); }
        .profile-admin > .admin-message { grid-column: 1 / -1; }
        @media (max-width: 760px) { .profile-admin { grid-template-columns: 1fr; } .profile-grid { grid-template-columns: 1fr; } .profile-assets { border-left: 0; border-top: 1px solid var(--hairline); padding: 1.25rem 0 0; } .profile-actions, .profile-admin > .admin-message { grid-column: auto; } }
      `}</style>
    </AdminShell>
  );
}
