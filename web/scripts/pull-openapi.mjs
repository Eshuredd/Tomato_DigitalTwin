import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const schemaUrl = process.env.CROPTWIN_OPENAPI_URL || "http://127.0.0.1:8000/openapi.json";
const output = path.resolve("src/lib/api/openapi.json");
const response = await fetch(schemaUrl, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
if (!response.ok) throw new Error(`OpenAPI pull failed with HTTP ${response.status} from ${schemaUrl}`);
const schema = await response.json();
if (!schema || typeof schema !== "object" || typeof schema.openapi !== "string" || typeof schema.paths !== "object") throw new Error("FastAPI returned an invalid OpenAPI document.");
await writeFile(output, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
console.log(`Saved FastAPI OpenAPI snapshot to ${output}`);
