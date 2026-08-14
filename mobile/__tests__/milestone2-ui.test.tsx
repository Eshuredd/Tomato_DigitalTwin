import { fireEvent, render, screen } from '@testing-library/react-native';
import { FarmListView, SessionSummaryCard } from '@/features/entities/presentation';
import { PrimaryButton } from '@/components/ui';
import { CropTwinApiError, type CreatedSession } from '@/lib/api';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
const farm = { farm_id: 'farm-a', name: 'Green Farm', created_at: 'now', updated_at: 'now' };
const session: CreatedSession = { state_id: 'state-a', crop_type: 'tomato', planting_date: '2026-08-13', location: { name: 'Field', latitude: 0, longitude: 0 }, soil_texture: 'loam', created_at: 'now' };

describe('Milestone 2 phone states', () => {
  it('renders farm loading', async () => { await render(<FarmListView pending refreshing error={null} refresh={jest.fn()} />); expect(screen.getByRole('progressbar', { name: 'Loading farms' })).toBeOnTheScreen(); });
  it('renders farm empty state', async () => { await render(<FarmListView farms={[]} pending={false} refreshing={false} error={null} refresh={jest.fn()} />); expect(screen.getByText('No farms yet')).toBeOnTheScreen(); });
  it('renders farm errors and retries', async () => { const refresh = jest.fn(); await render(<FarmListView pending={false} refreshing={false} error={new CropTwinApiError({ kind: 'network', code: 'NETWORK_ERROR', message: 'offline' })} refresh={refresh} />); fireEvent.press(screen.getByText('Retry')); expect(refresh).toHaveBeenCalledTimes(1); });
  it('renders farm success and authoritative navigation', async () => { await render(<FarmListView farms={[farm]} pending={false} refreshing={false} error={null} refresh={jest.fn()} />); fireEvent.press(screen.getByText('Green Farm')); expect(mockPush).toHaveBeenCalledWith({ pathname: '/farms/[farmId]', params: { farmId: 'farm-a' } }); });
  it('prevents duplicate presses while disabled', async () => { const action = jest.fn(); await render(<PrimaryButton disabled onPress={action}>Create</PrimaryButton>); fireEvent.press(screen.getByText('Create')); fireEvent.press(screen.getByText('Create')); expect(action).not.toHaveBeenCalled(); });
  it('shows created pre-snapshot state honestly', async () => { await render(<SessionSummaryCard session={session} />); expect(screen.getByText('Current state not computed')).toBeOnTheScreen(); });
  it('qualifies plot-origin navigation as non-authoritative', async () => { await render(<SessionSummaryCard session={session} provenance="Opened after plot North." />); expect(screen.getByText(/navigation context only/)).toBeOnTheScreen(); expect(screen.queryByText(/plot-backed/i)).toBeNull(); });
});
