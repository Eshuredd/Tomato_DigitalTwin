import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useState, type PropsWithChildren } from 'react';
import { Text } from 'react-native';
import { AdvancementResult } from '@/features/workflow/advancement';
import type { ReviewedIrrigation, ReviewedWeather } from '@/features/workflow/drafts';
import { WorkflowRequestIdentityStore } from '@/features/workflow/requests';
import { TwinWorkflow } from '@/features/workflow/twin';
import { WaterWorkflow } from '@/features/workflow/water';
import { IrrigationWorkflow } from '@/features/workflow/irrigation';
import { queryKeys } from '@/lib/api';
import { advancement, twinState, waterState } from '../test-support/milestone4-fixtures';

const originalFetch = globalThis.fetch; const clients: QueryClient[] = [];
function setup() { const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } }); clients.push(client); const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>; return { client, wrapper }; }
const ok = (value: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(value) } as Response);
const backendError = (code: string) => ({ ok: false, status: 409, text: async () => JSON.stringify({ error: { status_code: 409, code, message: 'Conflict.', details: {} } }) } as Response);
afterEach(() => { clients.splice(0).forEach((client) => client.clear()); globalThis.fetch = originalFetch; jest.restoreAllMocks(); });

const weather: ReviewedWeather = { stateId: 'state-a', targetDate: '2026-08-18', provenance: 'manual', weather: { tmin_c: 20, tmax_c: 30, humidity_pct: 60, wind_speed_mps: 2, rainfall_mm: 0 } };
const irrigation: ReviewedIrrigation = { stateId: 'state-a', event: null, distinction: 'no_irrigation', details: {} };

describe('Milestone 4 deterministic screen behavior', () => {
  it('lifts an accepted no-irrigation draft into the route owner without changing it to zero', async () => { function Host() { const [value, setValue] = useState<ReviewedIrrigation>(); return <><IrrigationWorkflow stateId="state-a" targetDate="2026-08-19" onAcceptedChange={setValue} /><Text>{value?.event === null ? 'Owner received no event' : 'Owner waiting'}</Text></>; } await render(<Host />); fireEvent.press(screen.getByText('Accept irrigation input')); await waitFor(() => expect(screen.getByText('Owner received no event')).toBeOnTheScreen()); });
  it('rebases stale water locally, preserves inputs, and submits explicitly with a new unbased identity', async () => { const { wrapper } = setup(); let id = 0; const identities = new WorkflowRequestIdentityStore('state-a', () => `water-${++id}`); globalThis.fetch = jest.fn().mockResolvedValueOnce(backendError('STALE_WATER_BASELINE')).mockResolvedValueOnce(ok({ ...waterState, water_update_id: 'water-2', water_observation_id: 'water-2', water_sequence: 2, base_water_observation_id: 'water-1', base_water_sequence: 1 })); await render(<WaterWorkflow stateId="state-a" weather={weather} irrigation={irrigation} current={waterState} identities={identities} />, { wrapper }); fireEvent.press(screen.getByText('Compute changed water state')); await waitFor(() => expect(screen.getByText('Rebase water request')).toBeOnTheScreen()); const first = JSON.parse((globalThis.fetch as jest.Mock).mock.calls[0][1].body); expect(first).toMatchObject({ water_update_id: 'water-1', base_water_observation_id: 'water-1', base_water_sequence: 1, weather: weather.weather, last_irrigation_event: null }); fireEvent.press(screen.getByText('Rebase water request')); await waitFor(() => expect(screen.getByText('Server-resolved')).toBeOnTheScreen()); expect(globalThis.fetch).toHaveBeenCalledTimes(1); fireEvent.press(screen.getByText('Compute changed water state')); await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2)); const second = JSON.parse((globalThis.fetch as jest.Mock).mock.calls[1][1].body); expect(second.water_update_id).toBe('water-2'); expect(second).not.toHaveProperty('base_water_observation_id'); expect(second).not.toHaveProperty('base_water_sequence'); expect(second.weather).toEqual(weather.weather); });
  it('does not use local disease cache as a twin-update gate and presents idempotent reuse', async () => { const { client, wrapper } = setup(); client.setQueryData(queryKeys.session('state-a'), { state_id: 'state-a' }); globalThis.fetch = jest.fn().mockResolvedValue(ok({ ...twinState, snapshot_created: false })); await render(<TwinWorkflow stateId="state-a" />, { wrapper }); fireEvent.press(screen.getByText('Update canonical twin')); await waitFor(() => expect(screen.getByText('Canonical twin already matched')).toBeOnTheScreen()); expect(globalThis.fetch).toHaveBeenCalledTimes(1); expect(JSON.parse((globalThis.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({ state_id: 'state-a' }); expect(client.getQueryState(queryKeys.session('state-a'))?.isInvalidated).toBe(true); });
  it('presents advancement_created false as successful idempotent reuse', async () => { await render(<AdvancementResult accepted={{ response: { ...advancement, advancement_created: false }, transition: 'current_reuse' }} />); expect(screen.getByText('Existing advancement idempotently reused')).toBeOnTheScreen(); expect(screen.getByText('Advancement reused')).toBeOnTheScreen(); expect(screen.getByText('current reuse')).toBeOnTheScreen(); });
});
