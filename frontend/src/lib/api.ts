import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/features/auth/store';
import { queryClient } from '@/lib/queryClient';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Request Interceptor: Attach JWT Access Token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().accessToken;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

const endSession = () => {
  useAuthStore.getState().logout();
  queryClient.clear();
};

// Refresh tokens rotate (and the old one is blacklisted), so concurrent 401s
// must share ONE refresh call instead of each burning the same token.
let refreshInFlight: Promise<string> | null = null;

const refreshAccessToken = (refreshToken: string): Promise<string> => {
  if (!refreshInFlight) {
    refreshInFlight = axios
      .post<{ access: string; refresh?: string }>(`${API_BASE_URL}/auth/token/refresh/`, {
        refresh: refreshToken,
      })
      .then((response) => {
        useAuthStore.getState().setTokens(response.data);
        return response.data.access;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
};

// Response Interceptor: refresh the access token once on 401, else end the session
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const isAuthCall = originalRequest?.url?.includes('/auth/token/');

    // A wrong-password 401 from the login call itself must reach the form.
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthCall) {
      originalRequest._retry = true;
      const refreshToken = useAuthStore.getState().refreshToken;

      if (!refreshToken) {
        endSession();
        return Promise.reject(error);
      }

      try {
        const newAccessToken = await refreshAccessToken(refreshToken);
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        endSession();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
