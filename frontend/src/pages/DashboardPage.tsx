import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/store';
import { customers as customersApi } from '@/features/customers/api';
import { CategoryDoughnutChart } from '@/features/reports/components/CategoryDoughnutChart';
import { SalesTrendChart } from '@/features/reports/components/SalesTrendChart';
import { useDashboardSummary, useSalesByCategory, useSalesTrend, useTopProducts } from '@/features/reports/api';

const BACK_OFFICE_ROLES = new Set(['OWNER', 'MANAGER', 'ACCOUNTANT']);
const TREND_OPTIONS = [7, 14, 30] as const;

const rs = (value: string | number) => `Rs. ${Number(value).toLocaleString()}`;
const formatDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.role);
  const canSeeAnalytics = role !== null && BACK_OFFICE_ROLES.has(role);
  const [trendDays, setTrendDays] = useState<(typeof TREND_OPTIONS)[number]>(14);

  const summary = useDashboardSummary();
  const trend = useSalesTrend(trendDays);
  const categoryTotals = useSalesByCategory(30);
  const topProducts = useTopProducts(30, 5);
  const outstandingCustomers = customersApi.useList({ page_size: 100 });

  const topDebtors = (outstandingCustomers.data?.results ?? [])
    .filter((c) => Number(c.outstanding_balance) > 0)
    .sort((a, b) => Number(b.outstanding_balance) - Number(a.outstanding_balance))
    .slice(0, 4);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F2') {
        event.preventDefault();
        navigate('/pos');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  return (
    <div className="flex flex-col w-full gap-space-xl erp-animate-page">
      {/* Top command bar */}
      <section className="erp-stagger-item erp-stagger-1 glass-card flex flex-col lg:flex-row lg:items-center justify-between gap-space-md p-space-lg rounded-xl shadow-sm">
        <div className="flex flex-wrap items-center gap-space-sm min-w-0">
          <div className="flex items-center gap-2 bg-surface-container-low px-space-md py-2 rounded-lg">
            <span className="material-symbols-outlined text-primary text-[20px]">calendar_today</span>
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-outline">Today</span>
              <span className="font-label-md text-label-md text-on-surface font-semibold">
                {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-space-sm shrink-0">
          <button
            className="h-10 px-space-md rounded-lg bg-surface-container-lowest hover:bg-surface-container-low text-on-surface shadow-xs font-label-md text-label-md flex items-center gap-2 transition-colors erp-btn-press cursor-pointer"
            type="button"
            onClick={() => navigate('/reports')}
          >
            <span className="material-symbols-outlined text-[18px] text-outline">bar_chart</span>
            <span>View Reports</span>
          </button>
          <button
            className="h-10 px-space-lg rounded-lg bg-primary-container hover:bg-primary text-on-primary font-label-lg text-label-lg flex items-center gap-2 shadow-xs erp-btn-press cursor-pointer"
            type="button"
            onClick={() => navigate('/pos')}
          >
            <span className="material-symbols-outlined text-[20px]">add_shopping_cart</span>
            <span>+ Quick Sale (F2)</span>
          </button>
        </div>
      </section>

      {/* 6 stat cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-space-md">
        <div className="erp-stagger-item erp-stagger-2 erp-card-hover glass-card p-space-md rounded-xl shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Today's Sales</span>
            <div className="w-8 h-8 rounded-lg bg-primary-fixed flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[18px]">payments</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-currency-stat text-currency-stat text-on-surface tracking-tight">{summary.data ? rs(summary.data.today_sales_total) : '—'}</span>
            <span className="font-label-sm text-label-sm text-outline mt-2">{summary.data?.today_sales_count ?? 0} invoice(s)</span>
          </div>
        </div>

        <div className="erp-stagger-item erp-stagger-3 erp-card-hover glass-card p-space-md rounded-xl shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Purchases In</span>
            <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant">
              <span className="material-symbols-outlined text-[18px]">local_shipping</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-currency-stat text-currency-stat text-on-surface tracking-tight">{summary.data ? rs(summary.data.today_purchases_total) : '—'}</span>
            <span className="font-label-sm text-label-sm text-outline mt-2">{summary.data?.today_purchases_count ?? 0} consignment(s)</span>
          </div>
        </div>

        <div className="erp-stagger-item erp-stagger-4 erp-card-hover glass-card p-space-md rounded-xl shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Farmer Khata Due</span>
            <div className="w-8 h-8 rounded-lg bg-tertiary-fixed flex items-center justify-center text-tertiary">
              <span className="material-symbols-outlined text-[18px]">menu_book</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-currency-stat text-currency-stat text-tertiary tracking-tight">{summary.data ? rs(summary.data.khata_outstanding_total) : '—'}</span>
            <span className="font-label-sm text-label-sm text-outline mt-2">{summary.data?.khata_outstanding_customers ?? 0} account(s)</span>
          </div>
        </div>

        <div className="erp-stagger-item erp-stagger-5 erp-card-hover glass-card p-space-md rounded-xl shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Supplier Payables</span>
            <div className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-currency-stat text-currency-stat text-on-surface tracking-tight">{summary.data ? rs(summary.data.supplier_payables_total) : '—'}</span>
            <span className="font-label-sm text-label-sm text-outline mt-2">Outstanding to suppliers</span>
          </div>
        </div>

        <div className="erp-stagger-item erp-stagger-6 erp-card-hover glass-card p-space-md rounded-xl shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Low Stock SKUs</span>
            <div className="w-8 h-8 rounded-lg bg-tertiary-fixed/60 flex items-center justify-center text-tertiary">
              <span className="material-symbols-outlined text-[18px]">warning</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-currency-stat text-currency-stat text-on-surface tracking-tight">{summary.data?.low_stock_count ?? '—'} Items</span>
            <Link to="/inventory" className="font-label-sm text-label-sm text-tertiary font-semibold mt-2 hover:underline w-fit">Reorder needed →</Link>
          </div>
        </div>

        <div className="erp-stagger-item erp-stagger-7 erp-card-hover glass-card p-space-md rounded-xl shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Expiring &lt;60d</span>
            <div className="w-8 h-8 rounded-lg bg-error-container flex items-center justify-center text-error">
              <span className="material-symbols-outlined text-[18px]">timelapse</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-currency-stat text-currency-stat text-error tracking-tight">{summary.data?.expiring_soon_count ?? '—'} Batches</span>
            <Link to="/inventory" className="font-label-sm text-label-sm text-error font-semibold mt-2 hover:underline w-fit">Inspect &amp; return →</Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter-lg items-start">
        {/* LEFT: trend chart + top products */}
        <div className="xl:col-span-8 flex flex-col gap-space-xl">
          <section className="erp-stagger-item erp-stagger-8 glass-card rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
              <div>
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">Revenue Stream</span>
                <h2 className="font-headline-md text-headline-md text-on-surface">Sales Trend</h2>
              </div>
              <div className="flex items-center bg-surface-container-low p-1 rounded-lg">
                {TREND_OPTIONS.map((days) => (
                  <button
                    key={days}
                    className={`px-3 py-1 rounded font-label-md text-label-md transition-colors cursor-pointer erp-btn-press ${
                      trendDays === days ? 'bg-surface-container-lowest text-primary shadow-sm font-semibold' : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                    onClick={() => setTrendDays(days)}
                    type="button"
                  >
                    {days}d
                  </button>
                ))}
              </div>
            </div>
            {trend.isPending ? (
              <div className="h-64 flex items-center justify-center text-outline font-body-sm text-body-sm">Loading trend...</div>
            ) : (
              <SalesTrendChart points={trend.data ?? []} />
            )}
          </section>

          {canSeeAnalytics && (
            <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">
              <div className="flex items-center justify-between mb-space-md">
                <div>
                  <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">Inventory Turnover</span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface">Top Selling Products (30 days)</h3>
                </div>
                <Link to="/products" className="text-primary font-label-md text-label-md hover:underline flex items-center gap-1">
                  <span>Full Catalog</span>
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-surface-container-low text-outline font-label-sm text-label-sm uppercase tracking-wider">
                      <th className="py-2.5 px-4 rounded-l-lg">Product</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3 text-right">Units Sold</th>
                      <th className="py-2.5 px-4 text-right rounded-r-lg">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container-low">
                    {topProducts.isPending && <tr><td className="py-space-lg text-center text-outline" colSpan={4}>Loading...</td></tr>}
                    {topProducts.isSuccess && topProducts.data.length === 0 && (
                      <tr><td className="py-space-lg text-center text-outline" colSpan={4}>No sales in the last 30 days.</td></tr>
                    )}
                    {topProducts.data?.map((p) => (
                      <tr key={p.product} className="hover:bg-surface-container-low/60 transition-colors">
                        <td className="py-3 px-4 font-body-md text-body-md font-semibold text-on-surface">{p.product_name}<div className="font-label-sm text-label-sm text-outline font-normal">{p.sku}</div></td>
                        <td className="py-3 px-3">
                          <span className="font-label-sm text-label-sm bg-surface-container-high text-primary px-2.5 py-1 rounded-full font-medium">{p.category_name || '—'}</span>
                        </td>
                        <td className="py-3 px-3 text-right font-body-md text-body-md text-on-surface">{p.quantity}</td>
                        <td className="py-3 px-4 text-right font-currency-cell text-currency-cell text-on-surface">{rs(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        {/* RIGHT: quick actions + recent sales + top debtors */}
        <div className="xl:col-span-4 flex flex-col gap-space-xl">
          <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">Desk Operations</span>
            <h3 className="font-headline-sm text-headline-sm text-on-surface mb-space-sm">Quick Actions</h3>
            <div className="grid grid-cols-1 gap-2 pt-1">
              {[
                { to: '/pos', icon: 'post_add', label: 'New Sale', sub: 'POS terminal & invoice', color: 'bg-primary-container text-on-primary' },
                { to: '/payments', icon: 'price_check', label: 'Record Farmer Payment', sub: 'Khata credit settlement', color: 'bg-secondary-container text-on-secondary-container' },
                { to: '/inventory', icon: 'move_to_inbox', label: 'Check Stock Levels', sub: 'Batches & expiry', color: 'bg-surface-container-highest text-primary' },
              ].map((action) => (
                <button
                  key={action.to}
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface transition-all text-left group cursor-pointer erp-btn-press"
                  type="button"
                  onClick={() => navigate(action.to)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded flex items-center justify-center ${action.color}`}>
                      <span className="material-symbols-outlined text-[20px]">{action.icon}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="font-label-lg text-label-lg font-semibold text-on-surface">{action.label}</span>
                      <span className="font-label-sm text-label-sm text-outline">{action.sub}</span>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors text-[20px]">chevron_right</span>
                </button>
              ))}
            </div>
          </section>

          {canSeeAnalytics && (
            <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">Sales Mix</span>
              <h3 className="font-headline-sm text-headline-sm text-on-surface mb-space-sm">By Category (30 days)</h3>
              {categoryTotals.isPending ? (
                <div className="h-64 flex items-center justify-center text-outline font-body-sm text-body-sm">Loading...</div>
              ) : (
                <CategoryDoughnutChart rows={categoryTotals.data ?? []} />
              )}
            </section>
          )}

          <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
            <h3 className="font-headline-sm text-headline-sm text-on-surface">Recent Sales</h3>
            <div className="flex flex-col gap-2">
              {summary.data?.recent_sales.length === 0 && <p className="font-body-sm text-body-sm text-outline">No sales yet.</p>}
              {summary.data?.recent_sales.map((sale) => (
                <button
                  key={sale.id}
                  className="p-3 bg-surface-container-low rounded-lg flex items-center justify-between hover:bg-surface-container transition-colors cursor-pointer text-left erp-btn-press"
                  onClick={() => navigate(`/invoices/${sale.id}`)}
                  type="button"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-label-md text-label-md text-on-surface font-semibold">{sale.invoice_no}</span>
                    <span className="font-label-sm text-label-sm text-outline truncate">{sale.customer_name} · {formatDate(sale.sale_date)}</span>
                  </div>
                  <span className={`font-currency-cell text-currency-cell font-bold ${sale.status === 'CANCELLED' ? 'text-outline line-through' : 'text-on-surface'}`}>{rs(sale.total_amount)}</span>
                </button>
              ))}
            </div>
          </section>

          {canSeeAnalytics && (
            <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <h3 className="font-headline-sm text-headline-sm text-on-surface">Highest Khata Balances</h3>
                <Link to="/customers" className="text-primary font-label-sm text-label-sm hover:underline">View all</Link>
              </div>
              <div className="flex flex-col gap-2">
                {topDebtors.length === 0 && <p className="font-body-sm text-body-sm text-outline">No outstanding khata balances.</p>}
                {topDebtors.map((c) => (
                  <button
                    key={c.id}
                    className="p-3 bg-surface-container-low rounded-lg flex items-center justify-between hover:bg-surface-container transition-colors cursor-pointer text-left erp-btn-press"
                    onClick={() => navigate(`/customers/${c.id}`)}
                    type="button"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="font-label-md text-label-md text-on-surface font-semibold">{c.name}</span>
                      <span className="font-label-sm text-label-sm text-outline truncate">{c.village || c.phone || '—'}</span>
                    </div>
                    <span className="font-currency-cell text-currency-cell text-error font-bold">{rs(c.outstanding_balance)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
