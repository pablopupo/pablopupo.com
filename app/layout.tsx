import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { cache } from "react";
import PageViewTracker from "@/components/page-view-tracker";
import VercelAnalytics from "@/components/vercel-analytics";
import Nav from "./nav";
import RouteTransition from "./route-transition";
import { createRootMetadata } from "@/lib/metadata";
import { getPublicProfile } from "@/lib/public-profile";
import { createSiteIdentity, serializeJsonLd } from "@/lib/site";
import { themeBootstrapScript } from "./theme";
import "./globals.css";

const newsreader = localFont({
  src: [
    { path: "./fonts/newsreader-latin-wght-normal.woff2", style: "normal" },
    { path: "./fonts/newsreader-latin-wght-italic.woff2", style: "italic" },
  ],
  weight: "200 800",
  variable: "--font-serif",
  display: "swap",
});

const readPublicProfile = cache(getPublicProfile);

export async function generateMetadata(): Promise<Metadata> {
  return createRootMetadata(await readPublicProfile());
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await readPublicProfile();
  const identity = createSiteIdentity(profile);
  return (
    <html
      lang="en"
      className={newsreader.variable}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(identity.structuredData),
          }}
        />
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <header>
          <Nav />
        </header>
        <main id="main-content">
          <RouteTransition>{children}</RouteTransition>
        </main>
        <footer>
          {profile.githubUrl ? <a href={profile.githubUrl}>GitHub</a> : null}
          {profile.linkedinUrl ? (
            <a href={profile.linkedinUrl}>LinkedIn</a>
          ) : null}
          {profile.youtubeUrl ? <a href={profile.youtubeUrl}>YouTube</a> : null}
          <Link href="/resume">Resume</Link>
          {profile.contactEmail ? (
            <a href={`mailto:${profile.contactEmail}`}>Email</a>
          ) : null}
          <Link href="/rss.xml">RSS</Link>
        </footer>
        <PageViewTracker />
        <VercelAnalytics />
      </body>
    </html>
  );
}
