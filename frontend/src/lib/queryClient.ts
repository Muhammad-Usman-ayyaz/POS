import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { getErrorMessage } from '@/lib/apiError';
import { notifyError } from '@/lib/notify';

// Failed mutations toast their error by default; a caller that handles the error
// itself can opt out with `meta: { silent: true }`. 401s are handled by the API
// client (refresh, else sign-out), so they never toast here.
const isUnauthorized = (error: unknown) =>
  typeof error === 'object' && error !== null && 'response' in error &&
  (error as { response?: { status?: number } }).response?.status === 401;

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Only surface background refetch failures once data is already on screen.
      if (query.state.data !== undefined && !isUnauthorized(error)) notifyError(getErrorMessage(error));
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      if (mutation.meta?.silent || isUnauthorized(error)) return;
      notifyError(getErrorMessage(error));
    },
  }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});
