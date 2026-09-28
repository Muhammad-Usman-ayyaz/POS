import React from 'react';

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
