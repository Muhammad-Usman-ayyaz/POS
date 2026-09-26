import { Navigate, createBrowserRouter } from 'react-router-dom';
import AuthLayout from '@/layouts/AuthLayout';
import DashboardLayout from '@/layouts/DashboardLayout';
import ProtectedRoute from '@/features/auth/ProtectedRoute';
import RoleProtectedRoute from '@/features/auth/RoleProtectedRoute';
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
import {
  PurchasesPage,
  EmployeesPage,
  SettingsPage,
  NotFoundPage,
} from '@/pages/PlaceholderPages';

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
        element: <POSPage />,
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
        element: <StockMovementPage />,
      },
      {
        path: '/suppliers',
        element: <SuppliersPage />,
      },
      {
        path: '/purchases',
        element: <PurchasesPage />,
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
        element: <ReportsPage />,
      },

      // Role-Protected Management Routes (OWNER, MANAGER)
      {
        path: '/employees',
        element: (
          <RoleProtectedRoute allowedRoles={['OWNER', 'MANAGER']}>
            <EmployeesPage />
          </RoleProtectedRoute>
        ),
      },
      {
        path: '/settings',
        element: (
          <RoleProtectedRoute allowedRoles={['OWNER', 'MANAGER']}>
            <SettingsPage />
          </RoleProtectedRoute>
        ),
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
