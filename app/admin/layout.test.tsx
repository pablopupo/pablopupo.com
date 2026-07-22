import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AdminLayout, { metadata } from "./layout";

describe("admin layout", () => {
  it("keeps every admin route out of search indexes", () => {
    expect(metadata).toMatchObject({
      robots: { index: false, follow: false },
    });
    expect(
      renderToStaticMarkup(
        <AdminLayout>
          <p>Protected editor</p>
        </AdminLayout>
      )
    ).toContain("Protected editor");
  });
});
