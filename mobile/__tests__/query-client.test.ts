import { CropTwinApiError } from '@/lib/api/errors';
import { queryDefaults } from '@/lib/query/client';

it('never retries mutations and restrains GET retries to transient network errors', () => {
  expect(queryDefaults.mutations?.retry).toBe(false);
  const retry = queryDefaults.queries?.retry as (count: number, error: Error) => boolean;
  expect(retry(0, new CropTwinApiError({ kind: 'network', code: 'NETWORK_ERROR', message: 'offline' }))).toBe(true);
  expect(retry(2, new CropTwinApiError({ kind: 'network', code: 'NETWORK_ERROR', message: 'offline' }))).toBe(false);
  expect(retry(0, new CropTwinApiError({ kind: 'backend', code: 'INVALID', message: 'bad' }))).toBe(false);
});
