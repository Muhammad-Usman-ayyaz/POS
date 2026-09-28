import type { User, UserRole } from '@/types/auth';

export type Employee = User;

export interface EmployeeInput {
  name: string;
  email: string;
  role: UserRole;
  password?: string;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: 'Shop Owner',
  MANAGER: 'Manager',
  SALESMAN: 'Salesman',
  ACCOUNTANT: 'Accountant',
};
