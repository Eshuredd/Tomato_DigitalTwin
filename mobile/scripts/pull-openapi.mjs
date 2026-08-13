import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const schemaUrl = process.env.CROPTWIN_OPENAPI_URL || 'http://127.0.0.1:8000/openapi.json';
const output = path.resolve('src/lib/api/openapi.json');
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 15_000);
try {
  const response = await fetch(schemaUrl, { headers: { Accept: 'application/json' }, signal: controller.signal });
  if (!response.ok) throw new Error(`OpenAPI pull failed with HTTP ${response.status} from ${schemaUrl}`);
  const schema = await response.json();
  if (!schema || typeof schema !== 'object' || typeof schema.openapi !== 'string' || typeof schema.paths !== 'object') throw new Error('FastAPI returned an invalid OpenAPI document.');
  await writeFile(output, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
  console.log(`Saved FastAPI OpenAPI snapshot to ${output}`);
} finally { clearTimeout(timeout); }
