import type React from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import AuthLayout from '@/layouts/AuthLayout';
import DashboardLayout from '@/layouts/DashboardLayout';
import ProtectedRoute from '@/features/auth/ProtectedRoute';
import RoleProtectedRoute from '@/features/auth/RoleProtectedRoute';
import { rolesFor } from '@/features/auth/permissions';
import LoginPage from '@/features/auth/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import POSPage from '@/pages/POSPage';
import ProductsPage from '@/pages/ProductsPage';
import InventoryPage from '@/pages/InventoryPage';
import StockMovementPage from '@/pages/StockMovementPage';
import SuppliersPage from '@/pages/SuppliersPage';
import CustomersPage from '@/pages/CustomersPage';
import CustomerProfilePage from '@/pages/CustomerProfilePage';
import KhataPage from '@/pages/KhataPage';
import PaymentsPage from '@/pages/PaymentsPage';
import SalesPage from '@/pages/SalesPage';
import InvoicesPage from '@/pages/InvoicesPage';
import InvoicePreviewPage from '@/pages/InvoicePreviewPage';
import ReportsPage from '@/pages/ReportsPage';
import PurchasesPage from '@/pages/PurchasesPage';
import {
  EmployeesPage,
  SettingsPage,
  NotFoundPage,
} from '@/pages/PlaceholderPages';

const guard = (path: string, element: React.ReactElement) => (
  <RoleProtectedRoute allowedRoles={rolesFor(path)}>{element}</RoleProtectedRoute>
);

export const router = createBrowserRouter([
  // Public Routes wrapped in AuthLayout
  {
    element: <AuthLayout />,
    children: [
      {
        path: '/login',
        element: <LoginPage />,
      },
    ],
  },

  // Protected ERP Routes wrapped in DashboardLayout
  {
    element: (
      <ProtectedRoute>
        <DashboardLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        path: '/',
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: '/dashboard',
        element: <DashboardPage />,
      },
      {
        path: '/pos',
        element: guard('/pos', <POSPage />),
      },
      {
        path: '/products',
        element: <ProductsPage />,
      },
      {
        path: '/inventory',
        element: <InventoryPage />,
      },
      {
        path: '/stock-movement',
        element: guard('/stock-movement', <StockMovementPage />),
      },
      {
        path: '/suppliers',
        element: guard('/suppliers', <SuppliersPage />),
      },
      {
        path: '/purchases',
        element: guard('/purchases', <PurchasesPage />),
      },
      {
        path: '/customers',
        element: <CustomersPage />,
      },
      {
        path: '/customers/:id',
        element: <CustomerProfilePage />,
      },
      {
        path: '/customer-profile',
        element: <CustomerProfilePage />,
      },
      {
        path: '/khata',
        element: <KhataPage />,
      },
      {
        path: '/sales',
        element: <SalesPage />,
      },
      {
        path: '/invoices',
        element: <InvoicesPage />,
      },
      {
        path: '/invoices/:id',
        element: <InvoicePreviewPage />,
      },
      {
        path: '/invoices/preview',
        element: <InvoicePreviewPage />,
      },
      {
        path: '/invoice-preview',
        element: <InvoicePreviewPage />,
      },
      {
        path: '/payments',
        element: <PaymentsPage />,
      },
      {
        path: '/record-payment',
        element: <PaymentsPage />,
      },
      {
        path: '/reports',
        element: guard('/reports', <ReportsPage />),
      },

      // Role-restricted routes (see features/auth/permissions.ts)
      {
        path: '/employees',
        element: guard('/employees', <EmployeesPage />),
      },
      {
        path: '/settings',
        element: guard('/settings', <SettingsPage />),
      },
    ],
  },

  // Fallback 404 Route
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);

export default router;
