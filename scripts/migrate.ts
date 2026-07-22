import { migrate } from "drizzle-orm/neon-http/migrator";
import { getDatabase } from "../lib/db/client";

await migrate(getDatabase(), { migrationsFolder: "drizzle" });
console.log("Database migrations applied");
