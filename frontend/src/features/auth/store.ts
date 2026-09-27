import { create } from 'zustand';
import type { AuthResponse, AuthState, User } from '@/types/auth';

const TOKEN_KEY = 'pesticide_erp_token';
const REFRESH_TOKEN_KEY = 'pesticide_erp_refresh_token';
const USER_KEY = 'pesticide_erp_user';

// "Remember this terminal" keeps the session in localStorage; otherwise it lives
// in sessionStorage and ends when the tab closes.
const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

const activeStorage = (): Storage | null =>
  safe(
    () => (localStorage.getItem(TOKEN_KEY) ? localStorage : sessionStorage.getItem(TOKEN_KEY) ? sessionStorage : null),
    null
  );

const clearAll = () =>
  safe(() => {
    for (const store of [localStorage, sessionStorage]) {
      store.removeItem(TOKEN_KEY);
      store.removeItem(REFRESH_TOKEN_KEY);
      store.removeItem(USER_KEY);
    }
  }, undefined);

const readSession = () => {
  const storage = activeStorage();
  if (!storage) return { user: null as User | null, access: null as string | null, refresh: null as string | null };
  const access = storage.getItem(TOKEN_KEY);
  const refresh = storage.getItem(REFRESH_TOKEN_KEY);
  let user: User | null = null;
  try {
    user = JSON.parse(storage.getItem(USER_KEY) ?? 'null') as User | null;
  } catch {
    user = null;
  }
  return { user, access, refresh };
};

const initial = readSession();

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: Boolean(initial.access && initial.user),
  user: initial.user,
  role: initial.user ? initial.user.role : null,
  accessToken: initial.access,
  refreshToken: initial.refresh,

  login: (data: AuthResponse, remember = true) => {
    clearAll();
    safe(() => {
      const storage = remember ? localStorage : sessionStorage;
      storage.setItem(TOKEN_KEY, data.access);
      storage.setItem(REFRESH_TOKEN_KEY, data.refresh);
      storage.setItem(USER_KEY, JSON.stringify(data.user));
    }, undefined);

    set({
      isAuthenticated: true,
      user: data.user,
      role: data.user.role,
      accessToken: data.access,
      refreshToken: data.refresh,
    });
  },

  logout: () => {
    clearAll();
    set({
      isAuthenticated: false,
      user: null,
      role: null,
      accessToken: null,
      refreshToken: null,
    });
  },

  // The backend rotates refresh tokens, so a refresh may hand back a new one.
  setTokens: ({ access, refresh }) => {
    safe(() => {
      const storage = activeStorage() ?? localStorage;
      storage.setItem(TOKEN_KEY, access);
      if (refresh) storage.setItem(REFRESH_TOKEN_KEY, refresh);
    }, undefined);
    set((state) => ({ accessToken: access, refreshToken: refresh ?? state.refreshToken }));
  },

  setUser: (user: User) => {
    safe(() => (activeStorage() ?? localStorage).setItem(USER_KEY, JSON.stringify(user)), undefined);
    set({ user, role: user.role });
  },
}));
