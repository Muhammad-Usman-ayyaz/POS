import React from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import type { UserRole } from '@/types/auth';
import { useAuthStore } from './store';

interface RoleProtectedRouteProps {
  allowedRoles: UserRole[];
  children?: React.ReactNode;
}

export const RoleProtectedRoute: React.FC<RoleProtectedRouteProps> = ({
  allowedRoles,
  children,
}) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const role = useAuthStore((state) => state.role);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!role || !allowedRoles.includes(role)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md rounded-xl bg-surface-container-lowest p-8 shadow-sm" role="alert">
          <h2 className="font-headline-md text-headline-md text-on-surface">Access Restricted</h2>
          <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
            Your role (<span className="font-semibold text-on-surface">{role ?? 'None'}</span>) does not have permission to open this module.
          </p>
          <Link
            to="/dashboard"
            className="mt-4 inline-flex h-10 items-center rounded-lg bg-primary px-space-md font-label-md text-label-md text-on-primary hover:bg-primary-container"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default RoleProtectedRoute;
