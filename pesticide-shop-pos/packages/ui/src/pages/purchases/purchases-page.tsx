import type { SessionUser } from '@pos/api-contract';
import { ArrowDownToLine } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/button.js';
import { Card } from '../../components/ui/primitives.js';
import { useI18n } from '../../i18n/index.js';

/** Purchases: for now a page that leads to Receive stock (the list of past receipts comes later). The link is for the owner only. */
export function PurchasesPage({ user }: { user: SessionUser }) {
  const { m } = useI18n();
  return (
    <div data-page="purchases">
      <header className="stagger mb-6">
        <h1 className="text-[32px] font-bold leading-tight">{m.pages.purchases.title}</h1>
        <p className="mt-1 text-base text-muted">{m.pages.purchases.subtitle}</p>
      </header>
      <Card className="stagger grid min-h-[320px] place-items-center p-8 text-center" style={{ '--i': 1 } as React.CSSProperties}>
        <div className="max-w-md">
          <ArrowDownToLine aria-hidden className="mx-auto mb-4 size-10 text-accent" />
          <p className="text-lg text-muted">{m.purchases.note}</p>
          {user.role === 'owner' && (
            <Button asChild size="lg" className="mt-6">
              <Link to="/purchases/receive">{m.purchases.receiveLink}</Link>
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
