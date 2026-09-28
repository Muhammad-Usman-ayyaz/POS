import React from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/store';
import { signOut } from '@/features/auth/session';
import { getCurrentUserApi } from '@/features/auth/api';
import { canAccess, ROLE_LABELS } from '@/features/auth/permissions';

export const DashboardLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const role = useAuthStore((state) => state.role);
  const setUser = useAuthStore((state) => state.setUser);
  const [profileDropdownOpen, setProfileDropdownOpen] = React.useState(false);

  const getNavLinkClass = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? 'flex items-center gap-space-sm px-space-sm py-2 transition-all duration-150 ease-out bg-surface-container-high text-primary font-label-md border-l-4 border-primary rounded-lg shadow-xs select-none active:scale-[0.98]'
      : 'flex items-center gap-space-sm px-space-sm py-2 rounded-lg text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-all duration-150 ease-out select-none active:scale-[0.98]';

  // Re-validate the stored session once per mount; a dead token ends the session
  // via the API interceptor, and a changed role/profile is picked up here.
  React.useEffect(() => {
    getCurrentUserApi().then(setUser).catch(() => undefined);
  }, [setUser]);

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="bg-background font-body-md text-on-surface antialiased min-h-screen">
      {/* Fixed Left Sidebar */}
      <aside className="fixed left-0 top-0 h-screen w-[250px] bg-surface-container-lowest z-50 flex flex-col border-r border-line">
        {/* Brand Header */}
        <div className="h-16 px-space-md flex items-center gap-space-sm border-b border-line shrink-0">
          <img
            alt="Pesticide Club Logo"
            className="h-8 w-auto object-contain"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDx6C6tbE8rGoIj7PtvO7ATDSW0mQl2crdSrE0tm3xhFa-OpplAbc5JzT6QxmpjE-tAKyEep6KdFtN_4poE8TgbESWXd881scoeEYwV8v3PatCYp3KNvkQdVc7Mv_wqXAJAtW3lBln__rHRnbTKkiBglMYi_YLrMUFoRJNwW3FgVy0UeRg4BgMcDuBhQhXM-_k9NqbW27owLCJZ8VVp87jv8nfS2hA4n55YvOYiLwCZeXXNEGEsPF6MyA"
          />
          <div className="flex flex-col min-w-0">
            <span className="font-headline-sm text-headline-sm text-primary tracking-tight truncate leading-tight">
              Pesticide Club
            </span>
            <span className="font-label-sm text-label-sm text-outline truncate">
              Agri ERP & Retail
            </span>
          </div>
        </div>

        {/* Scrollable Nav Items */}
        <div className="flex-1 overflow-y-auto px-space-sm py-space-sm">
          <nav className="flex flex-col gap-space-xs">
            {/* Main */}
            <div className="px-space-sm pt-space-xs pb-1">
              <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
                Main
              </span>
            </div>
            <NavLink to="/dashboard" className={getNavLinkClass} data-path="dashboard">
              <span className="material-symbols-outlined text-[18px]">dashboard</span>
              <span className="font-label-md text-label-md">Dashboard</span>
            </NavLink>

            {/* Sales */}
            <div className="px-space-sm pt-space-sm pb-1">
              <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
                Sales
              </span>
            </div>
            {canAccess(role, '/pos') && (
              <NavLink to="/pos" className={getNavLinkClass} data-path="pos-terminal">
                <span className="material-symbols-outlined text-[18px]">point_of_sale</span>
                <span className="font-label-md text-label-md">POS</span>
              </NavLink>
            )}
            <NavLink to="/sales" className={getNavLinkClass} data-path="sales-history">
              <span className="material-symbols-outlined text-[18px]">receipt_long</span>
              <span className="font-label-md text-label-md">Sales History</span>
            </NavLink>
            <NavLink to="/invoices" className={getNavLinkClass} data-path="invoices">
              <span className="material-symbols-outlined text-[18px]">description</span>
              <span className="font-label-md text-label-md">Invoices</span>
            </NavLink>

            {/* Inventory */}
            <div className="px-space-sm pt-space-sm pb-1">
              <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
                Inventory
              </span>
            </div>
            <NavLink to="/products" className={getNavLinkClass} data-path="products-catalog">
              <span className="material-symbols-outlined text-[18px]">pest_control</span>
              <span className="font-label-md text-label-md">Products</span>
            </NavLink>
            <NavLink to="/inventory" className={getNavLinkClass} data-path="inventory-stock">
              <span className="material-symbols-outlined text-[18px]">inventory_2</span>
              <span className="font-label-md text-label-md">Inventory</span>
            </NavLink>
            {canAccess(role, '/stock-movement') && (
              <NavLink to="/stock-movement" className={getNavLinkClass} data-path="stock-movement">
                <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
                <span className="font-label-md text-label-md">Stock Movement</span>
              </NavLink>
            )}

            {/* Procurement */}
            {canAccess(role, '/purchases') && (
              <div className="px-space-sm pt-space-sm pb-1">
                <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
                  Procurement
                </span>
              </div>
            )}
            {canAccess(role, '/purchases') && (
              <NavLink to="/purchases" className={getNavLinkClass} data-path="purchases">
                <span className="material-symbols-outlined text-[18px]">shopping_cart</span>
                <span className="font-label-md text-label-md">Purchases</span>
              </NavLink>
            )}
            {canAccess(role, '/suppliers') && (
              <NavLink to="/suppliers" className={getNavLinkClass} data-path="suppliers">
                <span className="material-symbols-outlined text-[18px]">local_shipping</span>
                <span className="font-label-md text-label-md">Suppliers</span>
              </NavLink>
            )}

            {/* Customers */}
            <div className="px-space-sm pt-space-sm pb-1">
              <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
                Customers
              </span>
            </div>
            <NavLink to="/customers" className={getNavLinkClass} data-path="farmers-customers">
              <span className="material-symbols-outlined text-[18px]">groups</span>
              <span className="font-label-md text-label-md">Farmers & Customers</span>
            </NavLink>
            <NavLink to="/khata" className={getNavLinkClass} data-path="farmer-khata-ledger">
              <span className="material-symbols-outlined text-[18px]">menu_book</span>
              <span className="font-label-md text-label-md">Farmer Khata</span>
            </NavLink>

            {/* Management */}
            {canAccess(role, '/reports') && (
              <div className="px-space-sm pt-space-sm pb-1">
                <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
                  Management
                </span>
              </div>
            )}
            {canAccess(role, '/reports') && (
              <NavLink to="/reports" className={getNavLinkClass} data-path="reports">
                <span className="material-symbols-outlined text-[18px]">bar_chart</span>
                <span className="font-label-md text-label-md">Reports</span>
              </NavLink>
            )}
            {canAccess(role, '/employees') && (
              <NavLink to="/employees" className={getNavLinkClass} data-path="employees">
                <span className="material-symbols-outlined text-[18px]">badge</span>
                <span className="font-label-md text-label-md">Employees</span>
              </NavLink>
            )}

            {/* System */}
            <div className="px-space-sm pt-space-sm pb-1">
              <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
                System
              </span>
            </div>
            <NavLink to="/notifications" className={getNavLinkClass} data-path="notifications">
              <span className="material-symbols-outlined text-[18px]">notifications</span>
              <span className="font-label-md text-label-md">Notifications</span>
            </NavLink>
            {canAccess(role, '/settings') && (
              <NavLink to="/settings" className={getNavLinkClass} data-path="settings">
                <span className="material-symbols-outlined text-[18px]">settings</span>
                <span className="font-label-md text-label-md">Settings</span>
              </NavLink>
            )}
          </nav>
        </div>

        {/* Sidebar Status Footer */}
        <div className="p-space-sm border-t border-line shrink-0 bg-surface-container-lowest">
          <div className="flex items-center gap-space-sm p-space-xs rounded-lg bg-surface-container-low">
            <div className="w-2 h-2 rounded-full bg-secondary shrink-0"></div>
            <div className="flex flex-col min-w-0">
              <span className="font-label-sm text-label-sm text-on-surface font-semibold truncate">
                Online Sync Active
              </span>
              <span className="font-label-sm text-label-sm text-outline truncate">
                Branch DB Connected
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area (shifted left by 250px) */}
      <div className="pl-[250px]">
        {/* Fixed Topbar Header */}
        <header className="fixed top-0 left-[250px] right-0 h-16 glass-header border-b border-line z-40 px-gutter-lg flex items-center justify-between">
          <div className="flex items-center gap-space-sm">
            <img
              alt="Pesticide Club Logo"
              className="h-8 w-auto object-contain"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuDx6C6tbE8rGoIj7PtvO7ATDSW0mQl2crdSrE0tm3xhFa-OpplAbc5JzT6QxmpjE-tAKyEep6KdFtN_4poE8TgbESWXd881scoeEYwV8v3PatCYp3KNvkQdVc7Mv_wqXAJAtW3lBln__rHRnbTKkiBglMYi_YLrMUFoRJNwW3FgVy0UeRg4BgMcDuBhQhXM-_k9NqbW27owLCJZ8VVp87jv8nfS2hA4n55YvOYiLwCZeXXNEGEsPF6MyA"
            />
            <div className="flex items-center gap-space-xs font-label-md text-label-md">
              <span className="text-outline">Agri ERP</span>
              <span className="text-outline-variant">/</span>
              <span className="text-primary font-semibold">Operations</span>
            </div>
          </div>

          <div className="flex items-center gap-space-md">
            {/* Quick Search */}
            <div className="relative hidden md:flex items-center">
              <span className="material-symbols-outlined absolute left-3 text-outline text-[18px]">
                search
              </span>
              <input
                className="h-[38px] w-80 pl-9 pr-3 rounded-lg border border-line bg-surface-container-lowest font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
                placeholder="Search farmer, invoice, batch, product... [Ctrl+K]"
                type="text"
              />
            </div>

            {/* Quick Action & Notifications */}
            <div className="flex items-center gap-space-xs">
              <button
                className="h-[38px] px-space-sm rounded-lg bg-primary text-on-primary font-label-md text-label-md flex items-center gap-1 hover:bg-primary-container erp-btn-press cursor-pointer"
                type="button"
                onClick={() => navigate('/pos')}
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                <span>New</span>
              </button>
              <button
                className="relative h-[38px] w-[38px] rounded-lg border border-line bg-surface-container-lowest flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low erp-btn-press cursor-pointer"
                type="button"
                onClick={() => navigate('/notifications')}
              >
                <span className="material-symbols-outlined text-[20px]">notifications</span>
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-error"></span>
              </button>
            </div>

            <div className="h-6 w-px bg-outline-variant"></div>

            {/* Branch Status Pill */}
            <div className="hidden lg:flex items-center gap-1.5 px-space-sm py-1 rounded-full bg-success-soft border border-success-line">
              <span className="w-2 h-2 rounded-full bg-success"></span>
              <span className="font-label-sm text-label-sm text-success">Main Branch • Open</span>
            </div>

            {/* User Profile */}
            <div className="relative">
              <button
                className="flex items-center gap-space-sm pl-space-xs cursor-pointer select-none erp-btn-press"
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                type="button"
              >
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
                </div>
                <div className="hidden xl:flex flex-col text-left">
                  <span className="font-label-md text-label-md text-on-surface font-semibold leading-tight">
                    {user?.name}
                  </span>
                  <span className="font-label-sm text-label-sm text-outline leading-tight">
                    {role ? ROLE_LABELS[role] : ''}
                  </span>
                </div>
                <span className="material-symbols-outlined text-outline text-[18px] transition-transform duration-150 ease-out" style={{ transform: profileDropdownOpen ? 'rotate(180deg)' : 'none' }}>
                  expand_more
                </span>
              </button>

              {profileDropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 glass-dropdown rounded-xl shadow-lg py-1 z-50 erp-animate-dropdown">
                  <div className="px-4 py-2 border-b border-surface-container-low">
                    <p className="text-xs text-outline">Signed in as</p>
                    <p className="text-sm font-semibold text-on-surface truncate">{user?.email}</p>
                  </div>
                  <button
                    className="w-full text-left px-4 py-2 text-sm text-on-surface hover:bg-surface-container-low flex items-center gap-2 transition-colors duration-100"
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      navigate('/settings');
                    }}
                  >
                    <span className="material-symbols-outlined text-[16px]">settings</span>
                    <span>Settings</span>
                  </button>
                  <button
                    className="w-full text-left px-4 py-2 text-sm text-error hover:bg-error-container/30 flex items-center gap-2 transition-colors duration-100"
                    onClick={handleLogout}
                  >
                    <span className="material-symbols-outlined text-[16px]">logout</span>
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Dynamic Route Content with subtle page entrance transition */}
        <main className="relative pt-16 w-full min-h-screen bg-surface px-gutter-lg py-margin-lg">
          <div key={location.pathname} className="erp-animate-page w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
