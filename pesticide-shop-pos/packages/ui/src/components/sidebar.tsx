import type { Language, SessionUser } from '@pos/api-contract';
import { ArrowDownToLine, Box, ChartColumn, LogOut, ShoppingCart, SlidersHorizontal, Undo2, Users, type LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { LANGUAGES, useI18n, type Messages } from '../i18n/index.js';
import { cn } from '../lib/cn.js';
import { SegmentedToggle } from './ui/segmented.js';

export type PageKey = 'pos' | 'products' | 'purchases' | 'customers' | 'returns' | 'reports' | 'settings';

export const NAV_ITEMS: readonly { key: PageKey; path: string; icon: LucideIcon; mirrorInRtl?: boolean }[] = [
  { key: 'pos', path: '/pos', icon: ShoppingCart },
  { key: 'products', path: '/products', icon: Box },
  { key: 'purchases', path: '/purchases', icon: ArrowDownToLine },
  { key: 'customers', path: '/customers', icon: Users },
  { key: 'returns', path: '/returns', icon: Undo2, mirrorInRtl: true },
  { key: 'reports', path: '/reports', icon: ChartColumn },
  { key: 'settings', path: '/settings', icon: SlidersHorizontal },
];

/**
 * The language switch. `tone` picks the look: light on the Sign in screen, dark in the sidebar.
 * The Urdu button is always labelled in Urdu, and the EN button in English, whatever language is on.
 */
export function LanguageSwitch({ tone, className }: { tone: 'light' | 'dark'; className?: string }) {
  const { language, m, setLanguage } = useI18n();
  return (
    <SegmentedToggle<Language>
      tone={tone}
      label={m.language.label}
      value={language}
      onChange={setLanguage}
      className={className}
      options={LANGUAGES.map((value) => ({ value, label: value === 'en' ? 'EN' : 'اردو', lang: value }))}
    />
  );
}

/**
 * The 232px dark sidebar: shop name, the seven pages, the language switch, and who is signed in.
 * On a narrow window (under 1366px) it shrinks to a 76px icon-only bar; the names stay available to screen
 * readers and as tooltips.
 */
export function Sidebar({ shopName, deviceText, user, onSignOut }: { shopName: string; deviceText: string; user: SessionUser; onSignOut: () => void }) {
  const { m, dir } = useI18n();
  return (
    <aside className="flex h-screen flex-col bg-sidebar px-4 py-8 text-sidebar-ink max-[1365px]:items-center max-[1365px]:px-3">
      <div className="mb-10 px-2 max-[1365px]:mb-8 max-[1365px]:px-0">
        <p className="text-[17px] font-bold leading-tight max-[1365px]:hidden">{shopName}</p>
        <p className="num mt-1 text-sm text-sidebar-muted max-[1365px]:hidden">{deviceText}</p>
        {/* collapsed: a monogram instead of the name */}
        <p aria-hidden className="hidden size-11 place-items-center rounded-md bg-nav-hover text-lg font-bold max-[1365px]:grid">
          {shopName.trim().charAt(0).toUpperCase()}
        </p>
      </div>

      <nav aria-label={m.nav.label} className="flex flex-1 flex-col gap-1 max-[1365px]:w-full">
        {NAV_ITEMS.map(({ key, path, icon: Icon, mirrorInRtl }, index) => (
          <NavLink
            key={key}
            to={path}
            title={m.nav[key]}
            style={{ '--i': index } as React.CSSProperties}
            className={({ isActive }) =>
              cn(
                'stagger lift flex min-h-12 items-center gap-2.5 whitespace-nowrap rounded-md px-4 text-base font-medium text-sidebar-ink hover:bg-nav-hover max-[1365px]:justify-center max-[1365px]:px-0',
                isActive && 'bg-nav-active font-bold text-white hover:bg-nav-active',
              )
            }
          >
            <Icon aria-hidden className={cn('size-[22px] shrink-0', mirrorInRtl && dir === 'rtl' && '-scale-x-100')} />
            <span className="max-[1365px]:sr-only">{m.nav[key]}</span>
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col gap-4 max-[1365px]:w-full">
        <LanguageSwitch tone="dark" className="max-[1365px]:flex-col" />
        <div className="border-t border-white/10 px-2 pt-4 max-[1365px]:flex max-[1365px]:flex-col max-[1365px]:items-center max-[1365px]:gap-2 max-[1365px]:px-0">
          <p className="text-sm text-sidebar-muted max-[1365px]:hidden">
            {m.sidebar.signedInAs} <b className="text-sidebar-ink">{m.role[user.role]}</b>
          </p>
          <p aria-hidden title={`${user.name} · ${m.role[user.role]}`} className="hidden size-9 place-items-center rounded-full bg-nav-hover text-sm font-bold max-[1365px]:grid">
            {user.name.trim().charAt(0).toUpperCase()}
          </p>
          <button
            type="button"
            onClick={onSignOut}
            title={m.sidebar.signOut}
            className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-sm text-sm font-medium text-sidebar-muted hover:text-white max-[1365px]:mt-0 max-[1365px]:justify-center"
          >
            <LogOut aria-hidden className={cn('size-[18px]', dir === 'rtl' && '-scale-x-100')} />
            <span className="max-[1365px]:sr-only">{m.sidebar.signOut}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

export type { Messages };
