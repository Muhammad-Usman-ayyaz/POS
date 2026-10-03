import { Construction } from 'lucide-react';
import { useI18n } from '../i18n/index.js';
import { Card } from '../components/ui/primitives.js';
import type { PageKey } from '../components/sidebar.js';

/** An empty page for a screen that is built in a later phase. Same header style as the real pages will have. */
export function PlaceholderPage({ page }: { page: PageKey }) {
  const { m } = useI18n();
  const info = m.pages[page];
  return (
    <div data-page={page}>
      <header className="stagger mb-6">
        <h1 className="text-[32px] font-bold leading-tight">{info.title}</h1>
        <p className="mt-1 text-base text-muted">{info.subtitle}</p>
      </header>
      <Card className="stagger grid min-h-[360px] place-items-center p-8 text-center" style={{ '--i': 1 } as React.CSSProperties}>
        <div className="max-w-md">
          <Construction aria-hidden className="mx-auto mb-4 size-10 text-accent" />
          <p className="text-xl font-semibold">{m.placeholder.builtIn(info.phase)}</p>
          <p className="mt-2 text-muted">{m.placeholder.note}</p>
        </div>
      </Card>
    </div>
  );
}
