import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminAccessState, AdminShell } from "./admin-shell";

describe("admin shell", () => {
  it("uses native route tabs and marks the active section", () => {
    const html = renderToStaticMarkup(
      <AdminShell activeTab="profile" description="Public profile settings">
        <p>Profile form</p>
      </AdminShell>
    );

    expect(html).toContain('<a href="/admin">Entries</a>');
    expect(html).toContain('<a href="/admin/work">Work</a>');
    expect(html).toContain('<a href="/admin/graph">Graph</a>');
    expect(html).toContain('<a href="/admin/comments">Comments</a>');
    expect(html).toContain('<a href="/admin/analytics">Analytics</a>');
    expect(html).toContain(
      '<a href="/admin/profile" aria-current="page">Profile</a>'
    );
    expect(html).toContain('<a href="/admin/media">Media</a>');
    expect(html).not.toContain("data-next-link");
    expect(html).toContain("Sign out");
  });

  it("renders every protected-route access state", () => {
    const unconfigured = renderToStaticMarkup(
      <AdminAccessState
        state={{
          mode: "unconfigured",
          configurationStatus: {
            configured: false,
            missing: ["DATABASE_URL"],
            invalid: [],
          },
        }}
      />
    );
    const signedOut = renderToStaticMarkup(
      <AdminAccessState state={{ mode: "signed-out" }} />
    );
    const forbidden = renderToStaticMarkup(
      <AdminAccessState state={{ mode: "forbidden" }} />
    );

    expect(unconfigured).toContain("Admin configuration is incomplete");
    expect(unconfigured).toContain("DATABASE_URL");
    expect(signedOut).toContain("Sign in with GitHub");
    expect(forbidden).toContain("does not match the configured owner");
  });
});
