import { queryKeys } from '@/lib/api/query-keys';

describe('query key isolation', () => {
  it('keeps state IDs isolated', () => expect(queryKeys.twinState('state-a')).not.toEqual(queryKeys.twinState('state-b')));
  it('keeps weather dates isolated', () => expect(queryKeys.weatherSnapshot('state-a', '2026-08-12')).not.toEqual(queryKeys.weatherSnapshot('state-a', '2026-08-13')));
  it('keeps actual-action limits isolated', () => expect(queryKeys.actualActions('state-a', 20)).not.toEqual(queryKeys.actualActions('state-a', 50)));
  it('keeps plot lists farm-scoped', () => expect(queryKeys.farmPlots('farm-a')).not.toEqual(queryKeys.farmPlots('farm-b')));
});
