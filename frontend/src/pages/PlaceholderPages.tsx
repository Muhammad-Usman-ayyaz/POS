import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useAuthStore } from '@/features/auth/store';

interface PageProps {
  title: string;
  description: string;
  allowedRoles?: string[];
}

export const BasePlaceholderPage: React.FC<PageProps> = ({
  title,
  description,
  allowedRoles,
}) => {
  const { user, role } = useAuthStore();

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {allowedRoles && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Allowed Roles:</span>
            {allowedRoles.map((r) => (
              <span key={r} className="rounded bg-secondary px-2 py-0.5 font-mono text-[11px] font-semibold text-secondary-foreground">
                {r}
              </span>
            ))}
          </div>
        )}
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Phase 0 Technical Routing Verification</CardTitle>
          <CardDescription>
            This module route is registered and active in React Router. Final UI will be implemented in subsequent phases.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground font-mono bg-muted/30 p-4 rounded-md mx-6 mb-6">
          <p>Active Route Module: {title}</p>
          <p>Current User: {user?.name || 'Anonymous'} ({role || 'No Role'})</p>
          <p>Authentication Status: Verified</p>
        </CardContent>
      </Card>
    </div>
  );
};



export const SalesPage: React.FC = () => (
  <BasePlaceholderPage title="Sales" description="Sales history, orders, and returns" />
);

export const InvoicesPage: React.FC = () => (
  <BasePlaceholderPage title="Invoices" description="Tax invoices, billing, and receipt generation" />
);

export const ReportsPage: React.FC = () => (
  <BasePlaceholderPage title="Reports" description="Sales reports, inventory valuation, and profit & loss statements" />
);

export const EmployeesPage: React.FC = () => (
  <BasePlaceholderPage
    title="Employees (Management)"
    description="Staff members, sales rep assignments, and role-based permissions"
    allowedRoles={['OWNER', 'MANAGER']}
  />
);

export const SettingsPage: React.FC = () => (
  <BasePlaceholderPage
    title="Settings (Management)"
    description="Shop configuration, tax settings, receipt templates, and system controls"
    allowedRoles={['OWNER', 'MANAGER']}
  />
);

export const NotFoundPage: React.FC = () => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
    <div className="max-w-md rounded-lg border border-border bg-card p-8 shadow-sm">
      <h2 className="text-4xl font-extrabold text-primary">404</h2>
      <h3 className="mt-2 text-lg font-semibold text-foreground">Page Not Found</h3>
      <p className="mt-2 text-xs text-muted-foreground">
        The requested URL does not match any registered route in the Pesticide Club Shop ERP.
      </p>
    </div>
  </div>
);
