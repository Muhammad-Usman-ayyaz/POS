import { useState } from 'react';
import { Button } from '../components/ui/button.js';
import { Card, Num } from '../components/ui/primitives.js';
import { useI18n } from '../i18n/index.js';

/**
 * The "write this down" step. The heading above it comes from the page. The code never wraps: it is copied by hand.
 The code is shown here and nowhere else, never again: the main process keeps only a
 * hash. The owner must tick that it is written down before they can continue, and then the code leaves the screen.
 */
export function RecoveryCodeStep({ code, lead, continueLabel, onDone }: { code: string; lead?: string; continueLabel?: string; onDone: () => void }) {
  const { m } = useI18n();
  const [written, setWritten] = useState(false);
  return (
    <div className="flex flex-col gap-5 [@media(max-height:800px)]:gap-3">
      <p className="text-base text-muted">{lead ?? m.recovery.lead}</p>

      <Card className="pop-once border-accent bg-tint-soft px-6 py-5 text-center [@media(max-height:800px)]:py-3">
        <p className="text-sm font-semibold tracking-wide text-muted">{m.recovery.codeLabel}</p>
        <Num data-testid="recovery-code" className="mt-2 block whitespace-nowrap text-[clamp(20px,2vw,30px)] font-bold tracking-[0.06em] text-accent-dark">
          {code}
        </Num>
      </Card>

      <ol className="flex list-decimal flex-col gap-1.5 ps-6 text-base">
        {m.recovery.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base font-semibold">
        <input type="checkbox" checked={written} onChange={(e) => setWritten(e.target.checked)} className="size-6 accent-[var(--color-accent)]" />
        {m.recovery.confirm}
      </label>

      <Button size="xl" disabled={!written} onClick={onDone} className="w-full" data-testid="recovery-continue">
        {continueLabel ?? m.recovery.continue}
      </Button>
    </div>
  );
}
