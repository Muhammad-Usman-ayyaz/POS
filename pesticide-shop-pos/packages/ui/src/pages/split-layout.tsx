import type { ReactNode } from 'react';
import { LanguageSwitch } from '../components/sidebar.js';

/**
 * The Sign in design, shared by Sign in, first-launch setup and password reset: a dark green panel on the
 * start side (about 41% of the width) with the shop name, and the form on the other side with the
 * EN / اردو switch at the top. In Urdu the two sides swap places because the grid follows the page direction.
 */
export function SplitLayout({
  eyebrow,
  title,
  tagline,
  footer,
  heading,
  children,
}: {
  eyebrow: string;
  title: string;
  tagline: string;
  footer: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen grid-cols-[41%_minmax(0,1fr)]">
      <aside className="flex flex-col justify-between bg-sidebar px-[clamp(40px,5.6vw,112px)] py-[clamp(40px,10vh,132px)] text-sidebar-ink">
        <div>
          <p className="stagger text-base font-semibold tracking-[0.14em] text-sidebar-muted">{eyebrow}</p>
          <h1 className="stagger mt-6 text-[clamp(38px,3.7vw,76px)] font-bold leading-[1.1]" style={{ '--i': 1 } as React.CSSProperties}>
            {title}
          </h1>
          <p className="stagger mt-8 max-w-[520px] text-[clamp(18px,1.6vw,22px)] leading-relaxed text-sidebar-ink/85" style={{ '--i': 2 } as React.CSSProperties}>
            {tagline}
          </p>
        </div>
        <p className="num text-base text-sidebar-muted">{footer}</p>
      </aside>

      <main className="flex items-center justify-center overflow-y-auto px-8 py-10 [@media(max-height:800px)]:py-6">
        <div className="w-full max-w-[540px]">
          <div className="stagger mb-8 flex items-center justify-between gap-4 [@media(max-height:800px)]:mb-5">
            <h2 className="text-[clamp(32px,3.2vw,44px)] font-bold leading-tight">{heading}</h2>
            <LanguageSwitch tone="light" className="w-[168px] shrink-0" />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
