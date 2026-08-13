import { render, screen } from '@testing-library/react-native';
import { BackendStatusView } from '@/features/system/health-status';
import { CropTwinApiError } from '@/lib/api/errors';

const refetch = jest.fn();
it('renders loading, unavailable, and connected backend states', async () => {
  const view = await render(<BackendStatusView query={{ isPending: true, isFetching: true, error: null, refetch }} />);
  expect(screen.getByRole('progressbar')).toBeOnTheScreen();
  await view.rerender(<BackendStatusView query={{ isPending: false, isFetching: false, error: new CropTwinApiError({ kind: 'network', code: 'NETWORK_ERROR', message: 'offline' }), refetch }} />);
  expect(screen.getByRole('alert', { name: 'Service unavailable' })).toBeOnTheScreen();
  await view.rerender(<BackendStatusView query={{ isPending: false, isFetching: false, error: null, data: { status: 'ok', service: 'croptwin-api', version: 'mvp' }, refetch }} />);
  expect(screen.getByLabelText('Status: Connected')).toBeOnTheScreen(); expect(screen.getByText('CropTwin FastAPI')).toBeOnTheScreen(); expect(screen.queryByText('croptwin-api')).toBeNull();
});
