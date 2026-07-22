import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

function request(form?: FormData, origin = "https://example.com") {
  return new Request("https://example.com/api/admin/media", {
    method: form ? "POST" : "GET",
    headers: { origin },
    body: form,
  });
}

function uploadForm({
  bytes = new Uint8Array([1, 2, 3]),
  mimeType = "image/jpeg",
  filename = "portrait.jpg",
  altText = "Pablo Pupo at a piano",
  purpose = "profile",
}: {
  bytes?: Uint8Array<ArrayBuffer>;
  mimeType?: string;
  filename?: string;
  altText?: string;
  purpose?: string;
} = {}) {
  const form = new FormData();
  form.set("file", new File([bytes], filename, { type: mimeType }));
  form.set("altText", altText);
  form.set("purpose", purpose);
  return form;
}

function storedMedia() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    storageKey: "uploads/22222222-2222-4222-8222-222222222222.jpg",
    url: "https://blob.example/uploads/portrait.jpg",
    provider: "vercel-blob",
    purpose: "profile",
    originalFilename: "portrait.jpg",
    sha256: createHash("sha256").update(new Uint8Array([1, 2, 3])).digest("hex"),
    mimeType: "image/jpeg",
    altText: "Pablo Pupo at a piano",
    width: 1200,
    height: 1800,
    byteSize: 3,
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authorize: vi.fn().mockResolvedValue({ status: "authorized", userId: "user-1" }),
    isSameOrigin: vi.fn().mockReturnValue(true),
    storageConfigured: true,
    blobToken: "blob-token",
    randomUUID: vi.fn().mockReturnValue("22222222-2222-4222-8222-222222222222"),
    validateMediaBytes: vi.fn().mockResolvedValue({
      kind: "image",
      mimeType: "image/jpeg",
      extension: "jpg",
      byteSize: 3,
      width: 1200,
      height: 1800,
    }),
    putBlob: vi.fn().mockResolvedValue({
      url: "https://blob.example/uploads/portrait.jpg",
      pathname: "uploads/22222222-2222-4222-8222-222222222222.jpg",
      contentType: "image/jpeg",
      contentDisposition: "inline",
      downloadUrl: "https://blob.example/uploads/portrait.jpg?download=1",
    }),
    deleteBlob: vi.fn().mockResolvedValue(undefined),
    repository: {
      listMedia: vi.fn().mockResolvedValue([storedMedia()]),
      createMedia: vi.fn().mockResolvedValue(storedMedia()),
    },
    ...overrides,
  };
}

async function setup(overrides: Record<string, unknown> = {}) {
  const module = await import("./media-handlers").catch(() => undefined);
  expect(module?.createAdminMediaHandlers).toBeTypeOf("function");
  const deps = dependencies(overrides);
  return { deps, handlers: module!.createAdminMediaHandlers(deps) };
}

describe("admin media handlers", () => {
  it.each([
    ["unconfigured", 503],
    ["unauthenticated", 401],
    ["forbidden", 403],
  ])("maps %s access to %i", async (status, expectedStatus) => {
    const { handlers } = await setup({
      authorize: vi.fn().mockResolvedValue({ status }),
    });

    const response = await handlers.list(request());

    expect(response.status).toBe(expectedStatus);
  });

  it("lists media for the owner", async () => {
    const { handlers } = await setup();

    const response = await handlers.list(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ media: [storedMedia()] });
  });

  it("checks authorization and same-origin before reading multipart data", async () => {
    const crossOriginRequest = request(uploadForm(), "https://evil.example");
    const formData = vi.spyOn(crossOriginRequest, "formData");
    const { deps, handlers } = await setup({
      isSameOrigin: vi.fn().mockReturnValue(false),
    });

    const response = await handlers.upload(crossOriginRequest);

    expect(response.status).toBe(403);
    expect(formData).not.toHaveBeenCalled();
    expect(deps.putBlob).not.toHaveBeenCalled();
  });

  it("returns a clear 503 before reading the body when Blob is unconfigured", async () => {
    const uploadRequest = request(uploadForm());
    const formData = vi.spyOn(uploadRequest, "formData");
    const { deps, handlers } = await setup({
      storageConfigured: false,
      blobToken: undefined,
    });

    const response = await handlers.upload(uploadRequest);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "media storage is not configured",
    });
    expect(formData).not.toHaveBeenCalled();
    expect(deps.putBlob).not.toHaveBeenCalled();
  });

  it.each([
    [uploadForm({ purpose: "avatar" }), "an unknown purpose"],
    [uploadForm({ altText: "" }), "an image without alt text"],
    [uploadForm({ altText: "x".repeat(501) }), "alt text over 500 characters"],
  ])("rejects %s without uploading", async (form) => {
    const { deps, handlers } = await setup();

    const response = await handlers.upload(request(form));

    expect(response.status).toBe(422);
    expect(deps.putBlob).not.toHaveBeenCalled();
    expect(deps.repository.createMedia).not.toHaveBeenCalled();
  });

  it("rejects a body over the image byte ceiling before reading file bytes", async () => {
    const file = new File(
      [new Uint8Array(4_000_001)],
      "oversized.jpg",
      { type: "image/jpeg" }
    );
    const arrayBuffer = vi.spyOn(file, "arrayBuffer");
    const form = new FormData();
    form.set("file", file);
    form.set("altText", "Oversized image");
    form.set("purpose", "content");
    const { deps, handlers } = await setup();

    const response = await handlers.upload(request(form));

    expect(response.status).toBe(422);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(deps.validateMediaBytes).not.toHaveBeenCalled();
    expect(deps.putBlob).not.toHaveBeenCalled();
  });

  it("requires profile uploads to be images", async () => {
    const { deps, handlers } = await setup({
      validateMediaBytes: vi.fn().mockResolvedValue({
        kind: "document",
        mimeType: "application/pdf",
        extension: "pdf",
        byteSize: 3,
        width: null,
        height: null,
      }),
    });

    const response = await handlers.upload(
      request(
        uploadForm({
          mimeType: "application/pdf",
          filename: "portrait.pdf",
          purpose: "profile",
        })
      )
    );

    expect(response.status).toBe(422);
    expect(deps.putBlob).not.toHaveBeenCalled();
  });

  it("requires resume uploads to be PDFs", async () => {
    const { deps, handlers } = await setup();

    const response = await handlers.upload(
      request(uploadForm({ purpose: "resume", filename: "resume.jpg" }))
    );

    expect(response.status).toBe(422);
    expect(deps.putBlob).not.toHaveBeenCalled();
  });

  it("maps byte validation failures to 422 without uploading", async () => {
    const validationError = new Error("file content does not match its type");
    validationError.name = "MediaValidationError";
    const { deps, handlers } = await setup({
      validateMediaBytes: vi.fn().mockRejectedValue(validationError),
    });

    const response = await handlers.upload(request(uploadForm()));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: validationError.message });
    expect(deps.putBlob).not.toHaveBeenCalled();
  });

  it("uploads verified bytes to an exact random path and stores verified metadata", async () => {
    const { deps, handlers } = await setup();

    const response = await handlers.upload(request(uploadForm()));

    expect(response.status).toBe(201);
    expect(deps.validateMediaBytes).toHaveBeenCalledWith({
      bytes: new Uint8Array([1, 2, 3]),
      declaredMime: "image/jpeg",
      originalFilename: "portrait.jpg",
    });
    expect(deps.putBlob).toHaveBeenCalledWith(
      "uploads/22222222-2222-4222-8222-222222222222.jpg",
      new Uint8Array([1, 2, 3]),
      {
        access: "public",
        addRandomSuffix: false,
        contentType: "image/jpeg",
        maximumSizeInBytes: 4_000_000,
        token: "blob-token",
      }
    );
    expect(deps.repository.createMedia).toHaveBeenCalledWith({
      storageKey: "uploads/22222222-2222-4222-8222-222222222222.jpg",
      url: "https://blob.example/uploads/portrait.jpg",
      provider: "vercel-blob",
      purpose: "profile",
      originalFilename: "portrait.jpg",
      sha256: createHash("sha256")
        .update(new Uint8Array([1, 2, 3]))
        .digest("hex"),
      mimeType: "image/jpeg",
      altText: "Pablo Pupo at a piano",
      width: 1200,
      height: 1800,
      byteSize: 3,
    });
    await expect(response.json()).resolves.toEqual({ media: storedMedia() });
  });

  it("uploads with OIDC configuration without adding an undefined token", async () => {
    const { deps, handlers } = await setup({
      storageConfigured: true,
      blobToken: undefined,
    });

    const response = await handlers.upload(request(uploadForm()));

    expect(response.status).toBe(201);
    expect(deps.putBlob).toHaveBeenCalledWith(
      "uploads/22222222-2222-4222-8222-222222222222.jpg",
      new Uint8Array([1, 2, 3]),
      {
        access: "public",
        addRandomSuffix: false,
        contentType: "image/jpeg",
        maximumSizeInBytes: 4_000_000,
      }
    );
  });

  it("stores a PDF resume without alt text", async () => {
    const repository = {
      listMedia: vi.fn(),
      createMedia: vi.fn().mockResolvedValue({ id: "resume-media" }),
    };
    const { deps, handlers } = await setup({
      validateMediaBytes: vi.fn().mockResolvedValue({
        kind: "document",
        mimeType: "application/pdf",
        extension: "pdf",
        byteSize: 3,
        width: null,
        height: null,
      }),
      repository,
    });

    const response = await handlers.upload(
      request(
        uploadForm({
          mimeType: "application/pdf",
          filename: "resume.pdf",
          altText: "",
          purpose: "resume",
        })
      )
    );

    expect(response.status).toBe(201);
    expect(deps.repository.createMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "resume",
        mimeType: "application/pdf",
        altText: null,
        width: null,
        height: null,
      })
    );
  });

  it("deletes the uploaded Blob when the database insert fails", async () => {
    const { deps, handlers } = await setup({
      repository: {
        listMedia: vi.fn(),
        createMedia: vi.fn().mockRejectedValue(new Error("database unavailable")),
      },
    });

    const response = await handlers.upload(request(uploadForm()));

    expect(response.status).toBe(500);
    expect(deps.deleteBlob).toHaveBeenCalledWith(
      "https://blob.example/uploads/portrait.jpg",
      { token: "blob-token" }
    );
  });

  it("does not write metadata when Blob upload fails", async () => {
    const { deps, handlers } = await setup({
      putBlob: vi.fn().mockRejectedValue(new Error("blob unavailable")),
    });

    const response = await handlers.upload(request(uploadForm()));

    expect(response.status).toBe(502);
    expect(deps.repository.createMedia).not.toHaveBeenCalled();
    expect(deps.deleteBlob).not.toHaveBeenCalled();
  });
});
