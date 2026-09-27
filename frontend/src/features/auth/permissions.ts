import type { UserRole } from '@/types/auth';

const ALL: UserRole[] = ['OWNER', 'MANAGER', 'SALESMAN', 'ACCOUNTANT'];

/**
 * Route → roles allowed to open it. Paths not listed are open to every signed-in role.
 * The backend must enforce the same rules on its APIs; this only drives the UI.
 */
export const ROUTE_ROLES: Record<string, UserRole[]> = {
  '/pos': ['OWNER', 'MANAGER', 'SALESMAN'],
  '/stock-movement': ['OWNER', 'MANAGER', 'ACCOUNTANT'],
  '/purchases': ['OWNER', 'MANAGER', 'ACCOUNTANT'],
  '/suppliers': ['OWNER', 'MANAGER', 'ACCOUNTANT'],
  '/reports': ['OWNER', 'MANAGER', 'ACCOUNTANT'],
  '/employees': ['OWNER', 'MANAGER'],
  '/settings': ['OWNER', 'MANAGER'],
};

export const rolesFor = (path: string): UserRole[] => ROUTE_ROLES[path] ?? ALL;

export const canAccess = (role: UserRole | null, path: string): boolean =>
  role !== null && rolesFor(path).includes(role);

export const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: 'Shop Owner',
  MANAGER: 'Manager',
  SALESMAN: 'Salesman',
  ACCOUNTANT: 'Accountant',
};
