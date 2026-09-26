import React from 'react';
import { Outlet } from 'react-router-dom';

/**
 * AuthLayout — clean pass-through wrapper for auth routes.
 */
export const AuthLayout: React.FC = () => {
  return (
    <div className="min-h-screen">
      <Outlet />
    </div>
  );
};

export default AuthLayout;
