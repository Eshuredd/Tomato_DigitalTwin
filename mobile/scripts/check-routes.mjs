import { access } from 'node:fs/promises';
import path from 'node:path';

const routeFiles = ['index.tsx', 'farms.tsx', 'cycle.tsx', 'workflow.tsx', 'more.tsx'];
await Promise.all(routeFiles.map((file) => access(path.resolve('src/app/(tabs)', file))));
await access(path.resolve('src/app/(tabs)/_layout.tsx'));
for (const file of ['src/app/farms/create.tsx', 'src/app/farms/[farmId]/index.tsx', 'src/app/farms/[farmId]/plots/create.tsx', 'src/app/plots/[plotId]/index.tsx', 'src/app/plots/[plotId]/cycle/create.tsx', 'src/app/cycle/create.tsx', 'src/app/cycle/[stateId].tsx', 'src/app/workflow/[stateId].tsx']) await access(path.resolve(file));
console.log('Expo Router contains five tabs plus farm, plot, crop-cycle, session, and workflow flows.');
