import { create } from 'zustand';
import type { AuthResponse, AuthState, User } from '@/types/auth';

const TOKEN_KEY = 'pesticide_erp_token';
const REFRESH_TOKEN_KEY = 'pesticide_erp_refresh_token';
const USER_KEY = 'pesticide_erp_user';

const getInitialUser = (): User | null => {
  const savedUser = localStorage.getItem(USER_KEY);
  if (!savedUser) return null;
  try {
    return JSON.parse(savedUser) as User;
  } catch {
    return null;
  }
};

const initialToken = localStorage.getItem(TOKEN_KEY);
const initialRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
const initialUser = getInitialUser();

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: Boolean(initialToken && initialUser),
  user: initialUser,
  role: initialUser ? initialUser.role : null,
  accessToken: initialToken,
  refreshToken: initialRefreshToken,

  login: (data: AuthResponse) => {
    localStorage.setItem(TOKEN_KEY, data.access);
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));

    set({
      isAuthenticated: true,
      user: data.user,
      role: data.user.role,
      accessToken: data.access,
      refreshToken: data.refresh,
    });
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);

    set({
      isAuthenticated: false,
      user: null,
      role: null,
      accessToken: null,
      refreshToken: null,
    });
  },

  setAccessToken: (token: string) => {
    localStorage.setItem(TOKEN_KEY, token);
    set({ accessToken: token });
  },
}));
