import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ProfileEditor, {
  createSettingsPatch,
  isProfileFormBusy,
  profileMessageAfterEdit,
  profileStatusAfterEdit,
  saveProfileSettings,
  type ProfileSettings,
} from "./profile-editor";

const settings: ProfileSettings = {
  siteTitle: "Pablo Pupo",
  headline: "Software engineer building applied AI systems",
  location: "Miami, Florida",
  graduationOn: "2026-12-01",
  introMarkdown: "I build useful systems.",
  aboutMarkdown: "## About",
  contactEmail: "pablofpupo23@gmail.com",
  githubUrl: "https://github.com/pablopupo",
  linkedinUrl: "https://linkedin.com/in/pablopupo",
  youtubeUrl: "https://youtube.com/@pablopupo",
  avatarMediaId: "portrait-id",
  resumeMediaId: "resume-id",
  version: 7,
};

describe("profile settings", () => {
  it("sends the optimistic version with the editable settings payload", () => {
    expect(createSettingsPatch(settings)).toEqual({
      expectedVersion: 7,
      settings: {
        siteTitle: "Pablo Pupo",
        headline: "Software engineer building applied AI systems",
        location: "Miami, Florida",
        graduationOn: "2026-12-01",
        introMarkdown: "I build useful systems.",
        aboutMarkdown: "## About",
        contactEmail: "pablofpupo23@gmail.com",
        githubUrl: "https://github.com/pablopupo",
        linkedinUrl: "https://linkedin.com/in/pablopupo",
        youtubeUrl: "https://youtube.com/@pablopupo",
        avatarMediaId: "portrait-id",
        resumeMediaId: "resume-id",
      },
    });
  });

  it("returns a conflict without treating stale settings as saved", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Settings changed elsewhere" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      })
    );

    await expect(saveProfileSettings(settings, fetcher)).resolves.toEqual({
      status: "conflict",
      message: "Settings changed elsewhere",
    });
    expect(fetcher).toHaveBeenCalledWith("/api/admin/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(createSettingsPatch(settings)),
    });
  });

  it("keeps a conflict visible when the stale form is edited", () => {
    expect(profileStatusAfterEdit("conflict")).toBe("conflict");
    expect(profileStatusAfterEdit("error")).toBe("saved");
    expect(profileMessageAfterEdit("Profile saved")).toBe("");
  });

  it("locks an unversioned failed load but not a later save failure", () => {
    expect(isProfileFormBusy("error", 0, null)).toBe(true);
    expect(isProfileFormBusy("error", 7, null)).toBe(false);
    expect(isProfileFormBusy("saved", 7, "profile")).toBe(true);
  });

  it("renders native profile fields and replacement uploads", () => {
    const html = renderToStaticMarkup(<ProfileEditor />);

    for (const label of [
      "Site title",
      "Headline",
      "Location",
      "Graduation date",
      "Introduction",
      "About",
      "Contact email",
      "GitHub URL",
      "LinkedIn URL",
      "YouTube URL",
      "Portrait",
      "Resume",
      "Save profile",
      "Upload portrait",
      "Upload resume",
    ]) {
      expect(html).toContain(label);
    }
  });
});
