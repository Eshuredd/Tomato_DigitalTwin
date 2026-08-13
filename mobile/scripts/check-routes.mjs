import { access } from 'node:fs/promises';
import path from 'node:path';

const routeFiles = ['index.tsx', 'farms.tsx', 'cycle.tsx', 'workflow.tsx', 'more.tsx'];
await Promise.all(routeFiles.map((file) => access(path.resolve('src/app/(tabs)', file))));
await access(path.resolve('src/app/(tabs)/_layout.tsx'));
console.log('Expo Router tab foundation contains /, /farms, /cycle, /workflow, and /more.');
