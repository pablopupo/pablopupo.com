import type { PublicProfile } from "@/lib/public-profile";

type ProfileLinkKind =
  | "github"
  | "linkedin"
  | "email"
  | "resume"
  | "rss"
  | "youtube";

function ProfileIcon({ kind }: { kind: ProfileLinkKind }) {
  if (kind === "github") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.3-.4 6.8-1.6 6.8-7A5.4 5.4 0 0 0 19.4 4 5 5 0 0 0 19.3.5S18.2.1 15 1.8a13.4 13.4 0 0 0-6 0C5.8.1 4.7.5 4.7.5A5 5 0 0 0 4.6 4a5.4 5.4 0 0 0-1.4 3.7c0 5.4 3.5 6.6 6.8 7A4.8 4.8 0 0 0 9 18v4" />
        <path d="M9 18c-4.5 2-5-2-7-2" />
      </svg>
    );
  }
  if (kind === "linkedin") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6Z" />
        <path d="M2 9h4v12H2z" />
        <path d="M4 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      </svg>
    );
  }
  if (kind === "email") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect width="20" height="16" x="2" y="4" rx="2" />
        <path d="m22 7-8.8 5.6a2.2 2.2 0 0 1-2.4 0L2 7" />
      </svg>
    );
  }
  if (kind === "resume") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6M8 13h8M8 17h6" />
      </svg>
    );
  }
  if (kind === "rss") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" />
        <circle cx="5" cy="19" r="1" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.5 6.4a2.8 2.8 0 0 0-2-2C18.7 4 12 4 12 4s-6.7 0-8.5.4a2.8 2.8 0 0 0-2 2A29 29 0 0 0 1 12a29 29 0 0 0 .5 5.6 2.8 2.8 0 0 0 2 2C5.3 20 12 20 12 20s6.7 0 8.5-.4a2.8 2.8 0 0 0 2-2A29 29 0 0 0 23 12a29 29 0 0 0-.5-5.6Z" />
      <path d="m10 15 5-3-5-3Z" />
    </svg>
  );
}

export default function ProfileLinks({
  profile,
}: {
  profile: Pick<
    PublicProfile,
    "contactEmail" | "githubUrl" | "linkedinUrl" | "youtubeUrl"
  >;
}) {
  const links = [
    profile.githubUrl
      ? { href: profile.githubUrl, label: "GitHub", kind: "github" as const }
      : null,
    profile.linkedinUrl
      ? {
          href: profile.linkedinUrl,
          label: "LinkedIn",
          kind: "linkedin" as const,
        }
      : null,
    profile.contactEmail
      ? {
          href: `mailto:${profile.contactEmail}`,
          label: "Email",
          kind: "email" as const,
        }
      : null,
    { href: "/resume", label: "Résumé", kind: "resume" as const },
    { href: "/rss.xml", label: "RSS", kind: "rss" as const },
    profile.youtubeUrl
      ? {
          href: profile.youtubeUrl,
          label: "YouTube",
          kind: "youtube" as const,
        }
      : null,
  ].filter((link): link is NonNullable<typeof link> => link !== null);

  return (
    <nav className="profile-icon-links" aria-label="Profile links">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          aria-label={link.label}
          title={link.label}
        >
          <ProfileIcon kind={link.kind} />
        </a>
      ))}
    </nav>
  );
}
