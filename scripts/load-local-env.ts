import fs from "node:fs";
import path from "node:path";

export function loadLocalEnvironment(directory = process.cwd()) {
  const environmentPath = path.join(directory, ".env.local");
  if (fs.existsSync(environmentPath)) process.loadEnvFile(environmentPath);
}
