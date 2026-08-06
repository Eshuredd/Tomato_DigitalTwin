import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const tempDirectory = mkdtempSync(path.join(tmpdir(), "croptwin-openapi-"));
const temporaryOutput = path.join(tempDirectory, "schema.d.ts");
const executable = path.resolve("node_modules/.bin/openapi-typescript");
const schema = path.resolve("src/lib/api/openapi.json");
const checkedIn = path.resolve("src/lib/api/schema.d.ts");

try {
  const result = spawnSync(executable, [schema, "-o", temporaryOutput], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
  const normalize = (value) => value.replaceAll("\r\n", "\n");
  if (normalize(readFileSync(temporaryOutput, "utf8")) !== normalize(readFileSync(checkedIn, "utf8"))) {
    console.error("Generated API types are stale. Run npm run api:generate.");
    process.exit(1);
  }
  console.log("Generated API types match the checked-in OpenAPI snapshot.");
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}
