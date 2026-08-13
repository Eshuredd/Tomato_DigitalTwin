import { QueryClient, type DefaultOptions } from '@tanstack/react-query';
import { CropTwinApiError } from '@/lib/api/errors';

export const queryDefaults: DefaultOptions = {
  queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: (failureCount, error) => error instanceof CropTwinApiError && error.kind === 'network' && failureCount < 2 },
  mutations: { retry: false },
};
export function createQueryClient() { return new QueryClient({ defaultOptions: queryDefaults }); }
export const queryClient = createQueryClient();
