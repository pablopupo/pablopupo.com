import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import {
  DEFAULT_PUBLIC_PROFILE,
  getPublicProfile,
  type PublicProfile,
} from "@/lib/public-profile";
import { SocialCard } from "./social-card";

export const alt =
  "Pablo Pupo, AI engineer and classical pianist";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";
export const revalidate = 60;

const defaultPortraitPath = join(
  process.cwd(),
  "public",
  "media",
  "pablo-pupo-portrait.jpg"
);

async function profileWithEmbeddedDefaultPortrait(profile: PublicProfile) {
  if (profile.portraitUrl !== DEFAULT_PUBLIC_PROFILE.portraitUrl) {
    return profile;
  }
  const portrait = await readFile(defaultPortraitPath);
  return {
    ...profile,
    portraitUrl: `data:image/jpeg;base64,${portrait.toString("base64")}`,
  };
}

export default async function Image() {
  const profile = await profileWithEmbeddedDefaultPortrait(
    await getPublicProfile()
  );
  return new ImageResponse(<SocialCard profile={profile} />, size);
}
