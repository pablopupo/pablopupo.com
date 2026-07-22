import type { PublicProfile } from "@/lib/public-profile";
import { absoluteSiteUrl, createSiteIdentity } from "@/lib/site";

export function SocialCard({ profile }: { profile: PublicProfile }) {
  const identity = createSiteIdentity(profile);
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#fbfcfc",
        color: "#17212b",
        borderTop: "14px solid #245ea8",
        fontFamily: "Georgia, serif",
      }}
    >
      <div
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          justifyContent: "center",
          padding: "64px 32px 64px 76px",
        }}
      >
        <div
          style={{
            display: "flex",
            color: "#245ea8",
            fontFamily: "Arial, sans-serif",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          pablopupo.com
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 30,
            fontSize: 70,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          {identity.name}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            maxWidth: 650,
            fontSize: 38,
            lineHeight: 1.15,
          }}
        >
          {identity.headline}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 34,
            color: "#4c5c69",
            fontFamily: "Arial, sans-serif",
            fontSize: 23,
          }}
        >
          Applied AI&nbsp;&nbsp;·&nbsp;&nbsp;Open source&nbsp;&nbsp;·&nbsp;&nbsp;Classical piano
        </div>
        {identity.location ? (
          <div
            style={{
              display: "flex",
              marginTop: 18,
              color: "#6a7883",
              fontFamily: "Arial, sans-serif",
              fontSize: 20,
            }}
          >
            {identity.location}
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          width: 390,
          alignItems: "center",
          justifyContent: "center",
          paddingRight: 64,
        }}
      >
        <img
          src={absoluteSiteUrl(identity.portraitUrl)}
          alt={identity.portraitAlt}
          width={310}
          height={430}
          style={{
            borderRadius: 180,
            objectFit: "cover",
            objectPosition: "50% 36%",
          }}
        />
      </div>
    </div>
  );
}
