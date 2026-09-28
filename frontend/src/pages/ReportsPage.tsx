import React, { useState } from 'react';
import { batches as batchesApi } from '@/features/inventory/api';
import { useSalesByCategory, useSalesTrend, useTopProducts } from '@/features/reports/api';
import { SalesTrendChart } from '@/features/reports/components/SalesTrendChart';
import { CategoryDoughnutChart } from '@/features/reports/components/CategoryDoughnutChart';

const RANGE_OPTIONS = [7, 30, 90, 365] as const;
const RANGE_LABELS: Record<(typeof RANGE_OPTIONS)[number], string> = { 7: '7 Days', 30: '30 Days', 90: '90 Days', 365: '1 Year' };

const rs = (value: string | number) => `Rs. ${Number(value).toLocaleString()}`;
const formatDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const downloadCsv = (filename: string, header: string[], rows: (string | number)[][]) => {
  const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const ReportsPage: React.FC = () => {
  const [days, setDays] = useState<(typeof RANGE_OPTIONS)[number]>(30);

  const trend = useSalesTrend(days === 365 ? 90 : days); // sales-trend caps at 90 server-side
  const categoryTotals = useSalesByCategory(days);
  const topProducts = useTopProducts(days, 10);
  const lowStock = batchesApi.useList({ status: 'low', page_size: 10 });
  const nearExpiry = batchesApi.useList({ status: 'near_expiry', page_size: 10 });

  const periodRevenue = (categoryTotals.data ?? []).reduce((sum, c) => sum + Number(c.total), 0);

  return (
    <div className="flex flex-col w-full gap-y-space-lg erp-animate-page">
      <div className="erp-stagger-item erp-stagger-1 glass-card flex flex-col lg:flex-row lg:items-center justify-between gap-space-md p-space-lg rounded-xl shadow-sm">
        <div className="flex items-center gap-space-sm">
          <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[24px]">bar_chart</span>
          </div>
          <div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface">Reports</h1>
            <p className="font-body-sm text-body-sm text-outline">Sales, product, and inventory analytics — real data, no scheduling or export magic, just the numbers.</p>
          </div>
        </div>
        <div className="flex items-center bg-surface-container-low p-1 rounded-lg">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt}
              className={`px-3 py-1.5 rounded font-label-md text-label-md transition-colors cursor-pointer erp-btn-press ${
                days === opt ? 'bg-surface-container-lowest text-primary shadow-sm font-semibold' : 'text-on-surface-variant hover:text-on-surface'
              }`}
              onClick={() => setDays(opt)}
              type="button"
            >
              {RANGE_LABELS[opt]}
            </button>
          ))}
        </div>
      </div>

      <div className="erp-stagger-item erp-stagger-2 glass-card p-space-md rounded-xl shadow-sm">
        <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Revenue in period</span>
        <div className="font-currency-stat text-currency-stat text-primary font-bold mt-0.5">{rs(periodRevenue)}</div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter-lg items-start">
        <div className="xl:col-span-7 flex flex-col gap-space-lg">
          <section className="erp-stagger-item erp-stagger-3 bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-space-sm">Sales Trend{days === 365 ? ' (last 90 days)' : ''}</h2>
            {trend.isPending ? (
              <div className="h-64 flex items-center justify-center text-outline font-body-sm text-body-sm">Loading...</div>
            ) : (
              <SalesTrendChart points={trend.data ?? []} />
            )}
          </section>

          <section className="erp-stagger-item erp-stagger-4 bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">
            <div className="flex items-center justify-between mb-space-sm">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Top Selling Products</h2>
              <button
                className="text-primary hover:underline font-label-sm text-label-sm flex items-center gap-1 font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={!topProducts.data?.length}
                onClick={() => downloadCsv(
                  'top-products.csv', ['Product', 'SKU', 'Category', 'Quantity Sold', 'Revenue'],
                  (topProducts.data ?? []).map((p) => [p.product_name, p.sku, p.category_name ?? '', p.quantity, p.revenue])
                )}
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">file_download</span>
                Export CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low text-outline font-label-sm text-label-sm uppercase tracking-wider">
                    <th className="py-space-sm pl-space-sm pr-space-sm">Product</th>
                    <th className="py-space-sm px-space-sm">Category</th>
                    <th className="py-space-sm px-space-sm text-right">Qty</th>
                    <th className="py-space-sm pr-space-sm pl-space-sm text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-low font-body-md text-body-md text-on-surface">
                  {topProducts.isPending && <tr><td className="py-space-lg text-center text-outline" colSpan={4}>Loading...</td></tr>}
                  {topProducts.isSuccess && topProducts.data.length === 0 && (
                    <tr><td className="py-space-lg text-center text-outline" colSpan={4}>No sales in this period.</td></tr>
                  )}
                  {topProducts.data?.map((p) => (
                    <tr key={p.product} className="hover:bg-surface-container-low/60 transition-colors">
                      <td className="py-3 pl-space-sm pr-space-sm font-semibold">{p.product_name}<div className="font-body-sm text-body-sm text-outline font-normal">{p.sku}</div></td>
                      <td className="py-3 px-space-sm">{p.category_name || '—'}</td>
                      <td className="py-3 px-space-sm text-right">{p.quantity}</td>
                      <td className="py-3 pr-space-sm pl-space-sm text-right font-currency-cell text-currency-cell font-semibold">{rs(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="xl:col-span-5 flex flex-col gap-space-lg">
          <section className="erp-stagger-item erp-stagger-5 bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-space-sm">Sales by Category</h2>
            {categoryTotals.isPending ? (
              <div className="h-64 flex items-center justify-center text-outline font-body-sm text-body-sm">Loading...</div>
            ) : (
              <CategoryDoughnutChart rows={categoryTotals.data ?? []} />
            )}
          </section>

          <section className="erp-stagger-item erp-stagger-6 bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-space-sm">Low Stock</h2>
            <div className="flex flex-col divide-y divide-surface-container-low">
              {lowStock.isPending && <p className="py-space-md text-center text-outline font-body-sm text-body-sm">Loading...</p>}
              {lowStock.isSuccess && lowStock.data.results.length === 0 && (
                <p className="py-space-md text-center text-outline font-body-sm text-body-sm">Nothing below its reorder level.</p>
              )}
              {lowStock.data?.results.map((b) => (
                <div className="py-2.5 flex items-center justify-between gap-space-sm" key={b.id}>
                  <div className="min-w-0">
                    <span className="font-label-md text-label-md text-on-surface font-semibold block truncate">{b.product_name}</span>
                    <span className="font-label-sm text-label-sm text-outline">Batch {b.batch_no}</span>
                  </div>
                  <span className="font-currency-cell text-currency-cell text-warning font-bold shrink-0">{b.quantity} {b.stock_unit}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="erp-stagger-item erp-stagger-7 bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-space-sm">Expiring Within 90 Days</h2>
            <div className="flex flex-col divide-y divide-surface-container-low">
              {nearExpiry.isPending && <p className="py-space-md text-center text-outline font-body-sm text-body-sm">Loading...</p>}
              {nearExpiry.isSuccess && nearExpiry.data.results.length === 0 && (
                <p className="py-space-md text-center text-outline font-body-sm text-body-sm">Nothing expiring soon.</p>
              )}
              {nearExpiry.data?.results.map((b) => (
                <div className="py-2.5 flex items-center justify-between gap-space-sm" key={b.id}>
                  <div className="min-w-0">
                    <span className="font-label-md text-label-md text-on-surface font-semibold block truncate">{b.product_name}</span>
                    <span className="font-label-sm text-label-sm text-outline">Batch {b.batch_no}</span>
                  </div>
                  <span className="font-label-sm text-label-sm text-error font-bold shrink-0">{formatDate(b.expiry_date)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
