import type { SessionUser } from '@pos/api-contract';
import { Outlet, useLocation } from 'react-router-dom';
import { cn } from '../lib/cn.js';
import { Sidebar } from './sidebar.js';

/** Screens that want the room: the sidebar is the 72px icon bar at any window width, and the page fills the window without its own scroll. */
const COMPACT_ROUTES: readonly string[] = ['/pos'];

/**
 * The signed-in layout: sidebar plus the page. The grid puts the sidebar on the left in English and on the
 * right in Urdu by itself, because grid columns follow the page direction. The page scrolls on its own.
 */
export function AppShell({ shopName, deviceText, user, onSignOut }: { shopName: string; deviceText: string; user: SessionUser; onSignOut: () => void }) {
  const { pathname } = useLocation();
  const compact = COMPACT_ROUTES.includes(pathname);
  return (
    <div data-compact={compact} className={cn('grid h-screen max-[1365px]:grid-cols-[72px_minmax(0,1fr)]', compact ? 'grid-cols-[72px_minmax(0,1fr)]' : 'grid-cols-[232px_minmax(0,1fr)]')}>
      <Sidebar shopName={shopName} deviceText={deviceText} user={user} onSignOut={onSignOut} />
      <main className={cn('h-screen', compact ? 'overflow-hidden px-5 py-4' : 'overflow-y-auto px-8 py-6')}>
        <Outlet />
      </main>
    </div>
  );
}
