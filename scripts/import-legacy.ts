import { getDatabase } from "../lib/db/client";
import { importLegacyContent } from "../lib/db/legacy-import";

const result = await importLegacyContent(getDatabase(), process.cwd());
console.log(JSON.stringify(result, null, 2));
