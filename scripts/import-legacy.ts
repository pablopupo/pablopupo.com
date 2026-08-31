import { getDatabase } from "../lib/db/client";
import { importLegacyContent } from "../lib/db/legacy-import";
import { loadLocalEnvironment } from "./load-local-env";

async function runLegacyImport() {
  loadLocalEnvironment();

  const result = await importLegacyContent(getDatabase(), process.cwd());
  console.log(JSON.stringify(result, null, 2));
  return result;
}

export const legacyImport = runLegacyImport();
