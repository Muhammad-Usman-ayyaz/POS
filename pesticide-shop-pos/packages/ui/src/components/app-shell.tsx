import type { SessionUser } from '@pos/api-contract';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './sidebar.js';

/**
 * The signed-in layout: sidebar plus the page. The grid puts the sidebar on the left in English and on the
 * right in Urdu by itself, because grid columns follow the page direction. The page scrolls on its own.
 */
export function AppShell({ shopName, deviceText, user, onSignOut }: { shopName: string; deviceText: string; user: SessionUser; onSignOut: () => void }) {
  return (
    <div className="grid h-screen grid-cols-[232px_minmax(0,1fr)] max-[1365px]:grid-cols-[76px_minmax(0,1fr)]">
      <Sidebar shopName={shopName} deviceText={deviceText} user={user} onSignOut={onSignOut} />
      <main className="h-screen overflow-y-auto px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}
