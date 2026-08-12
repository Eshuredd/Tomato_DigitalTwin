import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'croptwin-mobile-openapi-'));
const temporaryOutput = path.join(temporaryDirectory, 'schema.d.ts');
try {
  const result = spawnSync(path.resolve('node_modules/.bin/openapi-typescript'), [path.resolve('src/lib/api/openapi.json'), '-o', temporaryOutput], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
  const normalize = (value) => value.replaceAll('\r\n', '\n');
  if (normalize(readFileSync(temporaryOutput, 'utf8')) !== normalize(readFileSync(path.resolve('src/lib/api/schema.d.ts'), 'utf8'))) {
    console.error('Generated API types are stale. Run npm run api:generate.'); process.exit(1);
  }
  console.log('Generated API types match the checked-in OpenAPI snapshot.');
} finally { rmSync(temporaryDirectory, { recursive: true, force: true }); }
