import { queryClient } from '@/lib/queryClient';
import { logoutApi } from './api';
import { useAuthStore } from './store';

/** Blacklists the refresh token server-side (best effort), then clears all local session state. */
export const signOut = async (): Promise<void> => {
  const { refreshToken, logout } = useAuthStore.getState();
  try {
    if (refreshToken) await logoutApi(refreshToken);
  } catch {
    // Offline or already-expired session: still sign out locally.
  }
  logout();
  queryClient.clear();
};
