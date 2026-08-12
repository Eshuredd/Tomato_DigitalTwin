import { render, screen } from '@testing-library/react-native';
import { ErrorState, LoadingState } from '@/components/ui';

describe('shared state accessibility', () => {
  it('labels loading progress', async () => { await render(<LoadingState label="Loading farm" />); expect(screen.getByRole('progressbar', { name: 'Loading farm' })).toBeOnTheScreen(); });
  it('announces errors without leading with raw JSON', async () => { await render(<ErrorState title="Connection failed" description="FastAPI is unavailable." technicalDetails={{ code: 'NETWORK_ERROR' }} />); expect(screen.getByRole('alert', { name: 'Connection failed' })).toBeOnTheScreen(); expect(screen.getByText('FastAPI is unavailable.')).toBeOnTheScreen(); expect(screen.queryByText(/NETWORK_ERROR/)).toBeNull(); });
});
