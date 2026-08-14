import { QueryClient } from '@tanstack/react-query';
import { queryKeys, type Farm, type Plot, type CreatedSession } from '@/lib/api';
import { seedFarmCreation, seedPlotCreation, seedSessionCreation } from '@/features/entities/hooks';

const farm = (id: string): Farm => ({ farm_id: id, name: id, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' });
const plot = (id: string, farmId: string): Plot => ({ plot_id: id, farm_id: farmId, name: id, location: { name: 'Field', latitude: 0, longitude: 0 }, soil_texture: 'loam', created_at: 'now', updated_at: 'now' });
const session: CreatedSession = { state_id: 'state-a', crop_type: 'tomato', planting_date: '2026-08-13', location: { name: 'Field', latitude: 0, longitude: 0 }, soil_texture: 'loam', created_at: 'now' };

describe('narrow canonical cache updates', () => {
  it('seeds farm list and detail without touching another farm', () => { const client = new QueryClient(); client.setQueryData(queryKeys.farm('other'), farm('other')); seedFarmCreation(client, farm('farm-a')); expect(client.getQueryData(queryKeys.farms())).toEqual([farm('farm-a')]); expect(client.getQueryData(queryKeys.farm('farm-a'))).toEqual(farm('farm-a')); expect(client.getQueryData(queryKeys.farm('other'))).toEqual(farm('other')); client.clear(); });
  it('seeds only the owning farm plot collection', () => { const client = new QueryClient(); client.setQueryData(queryKeys.farmPlots('farm-b'), [plot('b', 'farm-b')]); seedPlotCreation(client, 'farm-a', plot('a', 'farm-a')); expect(client.getQueryData(queryKeys.farmPlots('farm-a'))).toEqual([plot('a', 'farm-a')]); expect(client.getQueryData(queryKeys.farmPlots('farm-b'))).toEqual([plot('b', 'farm-b')]); expect(client.getQueryData(queryKeys.plot('a'))).toEqual(plot('a', 'farm-a')); client.clear(); });
  it('seeds the canonical created session resource', () => { const client = new QueryClient(); seedSessionCreation(client, session); expect(client.getQueryData(queryKeys.session('state-a'))).toEqual(session); client.clear(); });
  it('keeps all entity identifiers isolated', () => { expect(queryKeys.farm('a')).not.toEqual(queryKeys.farm('b')); expect(queryKeys.farmPlots('a')).not.toEqual(queryKeys.farmPlots('b')); expect(queryKeys.plot('a')).not.toEqual(queryKeys.plot('b')); expect(queryKeys.session('a')).not.toEqual(queryKeys.session('b')); });
});
