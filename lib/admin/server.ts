import { randomUUID } from "node:crypto";
import { Pool } from "@neondatabase/serverless";
import { del, put } from "@vercel/blob";
import { drizzle } from "drizzle-orm/neon-serverless";
import { revalidatePath } from "next/cache";
import * as schema from "../db/schema";
import { validateMediaBytes } from "../media/validation";
import { getAdminAccess } from "./access";
import { hasSameOrigin, readAdminConfiguration } from "./auth";
import { createAdminEntryHandlers } from "./handlers";
import { createAdminMediaHandlers } from "./media-handlers";
import { createAdminProjectHandlers } from "./project-handlers";
import {
  createAdminMediaRepository,
  createAdminSettingsRepository,
} from "./profile-repository";
import { createAdminProjectRepository } from "./project-repository";
import { createAdminEntryRepository } from "./repository";
import { createAdminSettingsHandlers } from "./settings-handlers";

type AdminEntryHandlers = ReturnType<typeof createAdminEntryHandlers>;
type AdminProjectHandlers = ReturnType<typeof createAdminProjectHandlers>;
type AdminSettingsHandlers = ReturnType<typeof createAdminSettingsHandlers>;
type AdminMediaHandlers = ReturnType<typeof createAdminMediaHandlers>;

function revalidateAdminContent() {
  revalidatePath("/admin");
  revalidatePath("/writing");
  revalidatePath("/music");
  revalidatePath("/rss.xml");
  revalidatePath("/sitemap.xml");
}

function revalidateProfile() {
  revalidatePath("/");
  revalidatePath("/about");
  revalidatePath("/admin");
  revalidatePath("/sitemap.xml");
}

function revalidateProjectContent() {
  revalidatePath("/");
  revalidatePath("/work");
  revalidatePath("/search");
  revalidatePath("/sitemap.xml");
}

export function readBlobConfiguration(
  environment: Record<string, string | undefined>
) {
  const token = environment.BLOB_READ_WRITE_TOKEN?.trim() || undefined;
  const storeId = environment.BLOB_STORE_ID?.trim();
  const oidcToken = environment.VERCEL_OIDC_TOKEN?.trim();
  return {
    configured: Boolean(token || (storeId && oidcToken)),
    token,
  };
}

export async function withAdminEntryHandlers(
  operation: (handlers: AdminEntryHandlers) => Promise<Response>
) {
  const configuration = readAdminConfiguration(process.env);
  if (!configuration) {
    return Response.json({ error: "admin is not configured" }, { status: 503 });
  }

  const pool = new Pool({ connectionString: configuration.databaseUrl });
  try {
    const database = drizzle(pool, { schema });
    const handlers = createAdminEntryHandlers({
      authorize: getAdminAccess,
      isSameOrigin: (request) =>
        hasSameOrigin(request, configuration.betterAuthUrl),
      now: () => new Date(),
      revalidate: revalidateAdminContent,
      repository: createAdminEntryRepository(database),
    });
    return await operation(handlers);
  } finally {
    await pool.end();
  }
}

export async function withAdminProjectHandlers(
  operation: (handlers: AdminProjectHandlers) => Promise<Response>
) {
  const configuration = readAdminConfiguration(process.env);
  if (!configuration) {
    return Response.json({ error: "admin is not configured" }, { status: 503 });
  }

  const pool = new Pool({ connectionString: configuration.databaseUrl });
  try {
    const database = drizzle(pool, { schema });
    const handlers = createAdminProjectHandlers({
      authorize: getAdminAccess,
      isSameOrigin: (request) =>
        hasSameOrigin(request, configuration.betterAuthUrl),
      now: () => new Date(),
      revalidate: revalidateProjectContent,
      repository: createAdminProjectRepository(database),
    });
    return await operation(handlers);
  } finally {
    await pool.end();
  }
}

export async function withAdminSettingsHandlers(
  operation: (handlers: AdminSettingsHandlers) => Promise<Response>
) {
  const configuration = readAdminConfiguration(process.env);
  if (!configuration) {
    return Response.json({ error: "admin is not configured" }, { status: 503 });
  }

  const pool = new Pool({ connectionString: configuration.databaseUrl });
  try {
    const database = drizzle(pool, { schema });
    const handlers = createAdminSettingsHandlers({
      authorize: getAdminAccess,
      isSameOrigin: (request) =>
        hasSameOrigin(request, configuration.betterAuthUrl),
      revalidate: revalidateProfile,
      repository: createAdminSettingsRepository(database),
    });
    return await operation(handlers);
  } finally {
    await pool.end();
  }
}

export async function withAdminMediaHandlers(
  operation: (handlers: AdminMediaHandlers) => Promise<Response>
) {
  const configuration = readAdminConfiguration(process.env);
  if (!configuration) {
    return Response.json({ error: "admin is not configured" }, { status: 503 });
  }

  const pool = new Pool({ connectionString: configuration.databaseUrl });
  try {
    const database = drizzle(pool, { schema });
    const blob = readBlobConfiguration(process.env);
    const handlers = createAdminMediaHandlers({
      authorize: getAdminAccess,
      isSameOrigin: (request) =>
        hasSameOrigin(request, configuration.betterAuthUrl),
      storageConfigured: blob.configured,
      blobToken: blob.token,
      randomUUID,
      validateMediaBytes,
      putBlob: async (pathname, bytes, options) =>
        put(pathname, Buffer.from(bytes), options),
      deleteBlob: async (url, options) => {
        await del(url, options);
      },
      repository: createAdminMediaRepository(database),
    });
    return await operation(handlers);
  } finally {
    await pool.end();
  }
}
