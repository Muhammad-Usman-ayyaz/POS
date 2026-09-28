import apiClient from '@/lib/api';
import type { AuthResponse, User } from '@/types/auth';
import type { LoginFormData } from './schemas';

export const loginApi = async (credentials: LoginFormData): Promise<AuthResponse> => {
  const response = await apiClient.post<AuthResponse>('/auth/token/', credentials);
  return response.data;
};

export const refreshTokenApi = async (refreshToken: string): Promise<{ access: string }> => {
  const response = await apiClient.post<{ access: string }>('/auth/token/refresh/', {
    refresh: refreshToken,
  });
  return response.data;
};

export const getCurrentUserApi = async (): Promise<User> => {
  const response = await apiClient.get<User>('/auth/me/');
  return response.data;
};

export const logoutApi = async (refreshToken: string): Promise<void> => {
  await apiClient.post('/auth/logout/', { refresh: refreshToken });
};

export const changePasswordApi = async (input: { current_password: string; new_password: string }): Promise<void> => {
  await apiClient.post('/auth/change-password/', input);
};
