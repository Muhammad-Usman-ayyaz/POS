export type UserRole = 'OWNER' | 'MANAGER' | 'SALESMAN' | 'ACCOUNTANT';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface AuthResponse {
  access: string;
  refresh: string;
  user: User;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  role: UserRole | null;
  accessToken: string | null;
  refreshToken: string | null;
  login: (data: AuthResponse, remember?: boolean) => void;
  logout: () => void;
  setTokens: (tokens: { access: string; refresh?: string }) => void;
  setUser: (user: User) => void;
}
