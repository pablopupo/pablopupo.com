import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { revalidatePath } from "next/cache";
import * as schema from "../db/schema";
import { getAdminAccess } from "./access";
import { hasSameOrigin, readAdminConfiguration } from "./auth";
import { createAdminEntryHandlers } from "./handlers";
import { createAdminEntryRepository } from "./repository";

type AdminEntryHandlers = ReturnType<typeof createAdminEntryHandlers>;

function revalidateAdminContent() {
  revalidatePath("/admin");
  revalidatePath("/writing");
  revalidatePath("/music");
  revalidatePath("/rss.xml");
  revalidatePath("/sitemap.xml");
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
