import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { PageTransition } from '@/components/ui/animation';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [chartPeriod, setChartPeriod] = useState<'Daily' | 'Weekly' | 'Monthly' | 'Season-to-Date'>('Weekly');

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
    <PageTransition>
      <div className="flex flex-col w-full gap-space-xl">
      {/* Top Command & Action Bar */}
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md bg-surface-container-lowest p-space-lg rounded-xl shadow-sm">
        <div className="flex flex-wrap items-center gap-space-sm min-w-0">
          <div className="flex items-center gap-2 bg-surface-container-low px-space-md py-2 rounded-lg">
            <span className="material-symbols-outlined text-primary text-[20px]">calendar_today</span>
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-outline">Trading Period</span>
              <span className="font-label-md text-label-md text-on-surface font-semibold">Today (14 Oct 2024)</span>
            </div>
            <span className="material-symbols-outlined text-outline text-[16px] ml-1">expand_more</span>
          </div>

          <div className="flex items-center gap-2 bg-surface-container-low px-space-md py-2 rounded-lg">
            <span className="material-symbols-outlined text-secondary text-[20px]">storefront</span>
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-outline">Terminal / Warehouse</span>
              <span className="font-label-md text-label-md text-on-surface font-semibold">Main Mandi Outlet (B-01)</span>
            </div>
            <span className="material-symbols-outlined text-outline text-[16px] ml-1">swap_horiz</span>
          </div>

          <div className="hidden xl:flex items-center gap-2 px-space-sm py-1.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm">
            <span className="w-2 h-2 rounded-full bg-secondary"></span>
            <span>Rabi Season Mandi Active</span>
          </div>
        </div>

        <div className="flex items-center gap-space-sm shrink-0">
          <button
            className="h-10 px-space-md rounded-lg bg-surface-container-lowest hover:bg-surface-container-low text-on-surface shadow-xs font-label-md text-label-md flex items-center gap-2 transition-colors erp-btn-press cursor-pointer"
            type="button"
            onClick={() => navigate('/reports')}
          >
            <span className="material-symbols-outlined text-[18px] text-outline">file_download</span>
            <span>Export Report</span>
          </button>
          <button
            className="h-10 px-space-lg rounded-lg bg-primary-container hover:bg-primary text-on-primary font-label-lg text-label-lg flex items-center gap-2 shadow-xs erp-btn-press active:scale-95 cursor-pointer"
            type="button"
            onClick={() => navigate('/pos')}
          >
            <span className="material-symbols-outlined text-[20px]">add_shopping_cart</span>
            <span>+ Quick Sale (F2)</span>
          </button>
        </div>
      </section>

      {/* 6 Financial & Agronomic Metric Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-space-md">
        {/* 1. Today's Sales */}
        <div className="animate-fade-in-up bg-surface-container-lowest p-space-md rounded-xl shadow-xs flex flex-col justify-between relative overflow-hidden group erp-card-hover border border-transparent hover:border-primary/20 cursor-default">
          <div className="absolute -right-3 -top-3 w-16 h-16 bg-primary/5 rounded-full blur-xl group-hover:bg-primary/10 transition-colors"></div>
          <div className="flex items-center justify-between mb-2">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Today's Sales</span>
            <div className="w-8 h-8 rounded-lg bg-primary-fixed flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[18px]">payments</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-currency-stat text-currency-stat text-on-surface tracking-tight">Rs. 486,250</span>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="inline-flex items-center gap-0.5 text-secondary font-label-sm text-label-sm font-bold bg-secondary-container/40 px-1.5 py-0.5 rounded">
                <span className="material-symbols-outlined text-[14px]">trending_up</span>+14.2%
              </span>
              <span className="font-label-sm text-label-sm text-outline">vs yesterday</span>
            </div>
          </div>
        </div>

        {/* 2. Today's Purchases */}
        <div className="animate-fade-in-up bg-surface-container-lowest p-space-md rounded-xl shadow-xs flex flex-col justify-between relative overflow-hidden group erp-card-hover border border-transparent hover:border-primary/20 cursor-default">
          <div className="flex items-center justify-between mb-2">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Purchases In</span>
            <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant">
              <span className="material-symbols-outlined text-[18px]">local_shipping</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-currency-stat text-currency-stat text-on-surface tracking-tight">Rs. 210,000</span>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="font-label-sm text-label-sm text-on-surface-variant bg-surface-container px-2 py-0.5 rounded font-medium">
                3 Consignments
              </span>
              <span className="font-label-sm text-label-sm text-outline truncate">Engro, Syngenta</span>
            </div>
          </div>
        </div>

        {/* 3. Customer Receivables (Khata) */}
        <div className="animate-fade-in-up bg-surface-container-lowest p-space-md rounded-xl shadow-xs flex flex-col justify-between relative overflow-hidden group erp-card-hover border border-transparent hover:border-primary/20 cursor-default">
          <div className="flex items-center justify-between mb-2">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Farmer Khata Due</span>
            <div className="w-8 h-8 rounded-lg bg-tertiary-fixed flex items-center justify-center text-tertiary">
              <span className="material-symbols-outlined text-[18px]">menu_book</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-currency-stat text-currency-stat text-tertiary tracking-tight">Rs. 1,420,800</span>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="font-label-sm text-label-sm text-tertiary font-semibold bg-tertiary-fixed-dim/40 px-2 py-0.5 rounded">
                38 Accounts
              </span>
              <span className="font-label-sm text-label-sm text-outline truncate">Harvesters pending</span>
            </div>
          </div>
        </div>

        {/* 4. Supplier Payables */}
        <div className="animate-fade-in-up bg-surface-container-lowest p-space-md rounded-xl shadow-xs flex flex-col justify-between relative overflow-hidden group erp-card-hover border border-transparent hover:border-primary/20 cursor-default">
          <div className="flex items-center justify-between mb-2">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Supplier Payables</span>
            <div className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-currency-stat text-currency-stat text-on-surface tracking-tight">Rs. 685,000</span>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="font-label-sm text-label-sm text-on-surface-variant font-medium bg-surface-container px-2 py-0.5 rounded">
                Due in 7 days
              </span>
              <span className="font-label-sm text-label-sm text-outline">FMC &amp; Bayer</span>
            </div>
          </div>
        </div>

        {/* 5. Low Stock Alerts */}
        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-xs flex flex-col justify-between relative overflow-hidden group erp-card-hover border border-transparent hover:border-primary/20 cursor-default">
          <div className="flex items-center justify-between mb-2">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Low Stock SKUs</span>
            <div className="w-8 h-8 rounded-lg bg-tertiary-fixed/60 flex items-center justify-center text-tertiary">
              <span className="material-symbols-outlined text-[18px]">warning</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-currency-stat text-currency-stat text-on-surface tracking-tight">12 Items</span>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="font-label-sm text-label-sm text-tertiary font-bold bg-tertiary-fixed-dim/50 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-ping"></span>
                Reorder Req.
              </span>
            </div>
          </div>
        </div>

        {/* 6. Expiring Soon */}
        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-xs flex flex-col justify-between relative overflow-hidden group erp-card-hover border border-transparent hover:border-primary/20 cursor-default">
          <div className="flex items-center justify-between mb-2">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Expiring &lt;60d</span>
            <div className="w-8 h-8 rounded-lg bg-error-container flex items-center justify-center text-error">
              <span className="material-symbols-outlined text-[18px]">timelapse</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-currency-stat text-currency-stat text-error tracking-tight">4 Batches</span>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="font-label-sm text-label-sm text-error font-semibold bg-error-container px-2 py-0.5 rounded-full">
                Inspect &amp; Return
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Main 12-Column Operational Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter-lg items-start">
        {/* LEFT COLUMN (8 COLS): Analytics, Flows & Top Products */}
        <div className="xl:col-span-8 flex flex-col gap-space-xl">
          {/* Sales Trend & Target Chart Card */}
          <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
              <div>
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  Revenue Stream Analysis
                </span>
                <h2 className="font-headline-md text-headline-md text-on-surface">Sales Overview &amp; Targets</h2>
              </div>
              <div className="flex items-center bg-surface-container-low p-1 rounded-lg">
                {(['Daily', 'Weekly', 'Monthly', 'Season-to-Date'] as const).map((period) => (
                  <button
                    key={period}
                    className={`px-3 py-1 rounded font-label-md text-label-md transition-colors cursor-pointer ${
                      chartPeriod === period
                        ? 'bg-surface-container-lowest text-primary shadow-sm font-semibold'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                    onClick={() => setChartPeriod(period)}
                    type="button"
                  >
                    {period}
                  </button>
                ))}
              </div>
            </div>

            {/* Key Financial Legend */}
            <div className="flex flex-wrap items-center gap-space-lg pt-1">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-primary-container"></span>
                <span className="font-label-md text-label-md text-outline">Achieved Sales:</span>
                <span className="font-currency-cell text-currency-cell text-on-surface">Rs. 3.48M</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-0.5 bg-outline-variant"></span>
                <span className="font-label-md text-label-md text-outline">Rabi Target:</span>
                <span className="font-currency-cell text-currency-cell text-on-surface-variant">Rs. 4.00M</span>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <span className="font-label-sm text-label-sm text-secondary bg-secondary-container/40 px-2 py-0.5 rounded-full font-semibold">
                  87% Target Achieved
                </span>
              </div>
            </div>

            {/* Inline Responsive SVG Trend Chart */}
            <div className="w-full h-64 relative bg-surface-container-low/40 rounded-lg p-space-sm flex flex-col justify-end">
              {/* Background Chart Grid Lines */}
              <div className="absolute inset-x-space-sm inset-y-space-sm flex flex-col justify-between pointer-events-none opacity-40">
                <div className="border-b border-outline-variant w-full flex justify-between text-outline font-label-sm text-[10px]">
                  <span>Rs. 800k</span><span></span>
                </div>
                <div className="border-b border-outline-variant w-full flex justify-between text-outline font-label-sm text-[10px]">
                  <span>Rs. 600k</span><span></span>
                </div>
                <div className="border-b border-outline-variant w-full flex justify-between text-outline font-label-sm text-[10px]">
                  <span>Rs. 400k</span><span></span>
                </div>
                <div className="border-b border-outline-variant w-full flex justify-between text-outline font-label-sm text-[10px]">
                  <span>Rs. 200k</span><span></span>
                </div>
                <div className="border-b border-outline-variant w-full flex justify-between text-outline font-label-sm text-[10px]">
                  <span>0</span><span></span>
                </div>
              </div>

              {/* Dynamic Vector Area + Target Line */}
              <svg className="w-full h-44 overflow-visible relative z-10" preserveAspectRatio="none" viewBox="0 0 700 200">
                <defs>
                  <linearGradient id="primarySaleGrad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#147A5F" stopOpacity="0.35"></stop>
                    <stop offset="100%" stopColor="#147A5F" stopOpacity="0.0"></stop>
                  </linearGradient>
                </defs>
                {/* Target Line Dashed */}
                <line opacity="0.6" stroke="var(--erp-outline)" strokeDasharray="6,6" strokeWidth="2" x1="20" x2="680" y1="60" y2="60"></line>
                {/* Area Fill */}
                <path d="M 20 180 L 20 140 Q 80 110 130 135 T 240 90 T 350 75 T 460 110 T 570 45 T 680 30 L 680 180 Z" fill="url(#primarySaleGrad)"></path>
                {/* Line Path */}
                <path d="M 20 140 Q 80 110 130 135 T 240 90 T 350 75 T 460 110 T 570 45 T 680 30" fill="none" stroke="#147A5F" strokeLinecap="round" strokeWidth="3"></path>
                {/* Plot Points */}
                <circle cx="130" cy="135" fill="#ffffff" r="4" stroke="#147A5F" strokeWidth="2.5"></circle>
                <circle cx="240" cy="90" fill="#ffffff" r="4" stroke="#147A5F" strokeWidth="2.5"></circle>
                <circle cx="350" cy="75" fill="#ffffff" r="4" stroke="#147A5F" strokeWidth="2.5"></circle>
                <circle cx="460" cy="110" fill="#ffffff" r="4" stroke="#147A5F" strokeWidth="2.5"></circle>
                <circle cx="570" cy="45" fill="#ffffff" r="4" stroke="#147A5F" strokeWidth="2.5"></circle>
                {/* Peak Point (Today) */}
                <circle className="animate-pulse" cx="680" cy="30" fill="#147A5F" r="6" stroke="#ffffff" strokeWidth="2"></circle>
              </svg>

              {/* Day Labels */}
              <div className="flex justify-between items-center px-4 pt-2 text-outline font-label-sm text-label-sm z-10">
                <span>08 Oct (Mon)</span>
                <span>09 Oct (Tue)</span>
                <span>10 Oct (Wed)</span>
                <span>11 Oct (Thu)</span>
                <span>12 Oct (Fri)</span>
                <span>13 Oct (Sat)</span>
                <span className="text-primary font-bold">14 Oct (Today)</span>
              </div>
            </div>
          </section>

          {/* Cash Flow Balance: Sales vs Purchases Comparison Widget */}
          <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-space-md">
              <div>
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">Trading Flow</span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface">Weekly Inflow vs Procurement Outflow</h3>
              </div>
              <span className="font-label-sm text-label-sm text-secondary font-semibold bg-secondary-container/30 px-3 py-1 rounded-full">
                Net Surplus: +Rs. 1,120,400
              </span>
            </div>

            {/* Paired Bar Graph (Mon to Sun) */}
            <div className="grid grid-cols-7 gap-space-sm pt-4">
              {/* Day 1 */}
              <div className="flex flex-col items-center gap-2">
                <div className="h-32 w-full flex items-end justify-center gap-1.5 bg-surface-container-low rounded p-1">
                  <div className="w-3 bg-primary-container rounded-t" style={{ height: '65%' }}></div>
                  <div className="w-3 bg-tertiary-fixed-dim rounded-t" style={{ height: '40%' }}></div>
                </div>
                <span className="font-label-sm text-label-sm text-outline">Mon</span>
              </div>
              {/* Day 2 */}
              <div className="flex flex-col items-center gap-2">
                <div className="h-32 w-full flex items-end justify-center gap-1.5 bg-surface-container-low rounded p-1">
                  <div className="w-3 bg-primary-container rounded-t" style={{ height: '78%' }}></div>
                  <div className="w-3 bg-tertiary-fixed-dim rounded-t" style={{ height: '30%' }}></div>
                </div>
                <span className="font-label-sm text-label-sm text-outline">Tue</span>
              </div>
              {/* Day 3 */}
              <div className="flex flex-col items-center gap-2">
                <div className="h-32 w-full flex items-end justify-center gap-1.5 bg-surface-container-low rounded p-1">
                  <div className="w-3 bg-primary-container rounded-t" style={{ height: '52%' }}></div>
                  <div className="w-3 bg-tertiary-fixed-dim rounded-t" style={{ height: '80%' }}></div>
                </div>
                <span className="font-label-sm text-label-sm text-outline">Wed</span>
              </div>
              {/* Day 4 */}
              <div className="flex flex-col items-center gap-2">
                <div className="h-32 w-full flex items-end justify-center gap-1.5 bg-surface-container-low rounded p-1">
                  <div className="w-3 bg-primary-container rounded-t" style={{ height: '85%' }}></div>
                  <div className="w-3 bg-tertiary-fixed-dim rounded-t" style={{ height: '45%' }}></div>
                </div>
                <span className="font-label-sm text-label-sm text-outline">Thu</span>
              </div>
              {/* Day 5 */}
              <div className="flex flex-col items-center gap-2">
                <div className="h-32 w-full flex items-end justify-center gap-1.5 bg-surface-container-low rounded p-1">
                  <div className="w-3 bg-primary-container rounded-t" style={{ height: '40%' }}></div>
                  <div className="w-3 bg-tertiary-fixed-dim rounded-t" style={{ height: '25%' }}></div>
                </div>
                <span className="font-label-sm text-label-sm text-outline">Fri</span>
              </div>
              {/* Day 6 */}
              <div className="flex flex-col items-center gap-2">
                <div className="h-32 w-full flex items-end justify-center gap-1.5 bg-surface-container-low rounded p-1">
                  <div className="w-3 bg-primary-container rounded-t" style={{ height: '92%' }}></div>
                  <div className="w-3 bg-tertiary-fixed-dim rounded-t" style={{ height: '60%' }}></div>
                </div>
                <span className="font-label-sm text-label-sm text-outline">Sat</span>
              </div>
              {/* Day 7 (Today) */}
              <div className="flex flex-col items-center gap-2">
                <div className="h-32 w-full flex items-end justify-center gap-1.5 bg-surface-container-high rounded p-1">
                  <div className="w-3 bg-primary rounded-t shadow-sm" style={{ height: '95%' }}></div>
                  <div className="w-3 bg-tertiary-container rounded-t shadow-sm" style={{ height: '42%' }}></div>
                </div>
                <span className="font-label-sm text-label-sm text-primary font-bold">Today</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-space-xl mt-space-md text-on-surface-variant font-label-md text-label-md">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-primary"></span>
                <span>Sales Realized</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-tertiary-fixed-dim"></span>
                <span>Vendor Procurement</span>
              </div>
            </div>
          </section>

          {/* Top Selling Agricultural Products Table */}
          <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  Inventory Turnover
                </span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface">Top Selling Agricultural Products</h3>
              </div>
              <Link
                to="/products"
                className="text-primary font-label-md text-label-md hover:underline flex items-center gap-1"
              >
                <span>Full Catalog View</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface-container-low text-outline font-label-sm text-label-sm uppercase tracking-wider">
                    <th className="py-2.5 px-4 rounded-l-lg">Product / Formulation</th>
                    <th className="py-2.5 px-3">Classification</th>
                    <th className="py-2.5 px-3">Batch &amp; Expiry</th>
                    <th className="py-2.5 px-3 text-right">Units Sold</th>
                    <th className="py-2.5 px-4 text-right rounded-r-lg">Gross Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y-0">
                  <tr className="hover:bg-surface-container-low/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">
                          <span className="material-symbols-outlined text-[18px]">science</span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-body-md text-body-md font-semibold text-on-surface truncate">
                            Emamectin Benzoate 1.9% EC
                          </span>
                          <span className="font-label-sm text-label-sm text-outline">
                            Target: Bollworm / Fall Armyworm
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-label-sm text-label-sm bg-surface-container-high text-primary px-2.5 py-1 rounded-full font-medium">
                        Insecticide
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-col">
                        <span className="font-label-md text-label-md text-on-surface">EB-9941</span>
                        <span className="font-label-sm text-label-sm text-outline">Exp: May 2026</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-body-md text-body-md text-on-surface">142 Cans</td>
                    <td className="py-3 px-4 text-right font-currency-cell text-currency-cell text-on-surface">
                      Rs. 99,400
                    </td>
                  </tr>

                  <tr className="bg-surface-container-low/20 hover:bg-surface-container-low/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-secondary-container/40 flex items-center justify-center text-secondary shrink-0">
                          <span className="material-symbols-outlined text-[18px]">eco</span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-body-md text-body-md font-semibold text-on-surface truncate">
                            DAP Fertilizer 50kg Sona
                          </span>
                          <span className="font-label-sm text-label-sm text-outline">
                            Di-Ammonium Phosphate (FFC)
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-label-sm text-label-sm bg-secondary-container/50 text-on-secondary-container px-2.5 py-1 rounded-full font-medium">
                        Fertilizer
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-col">
                        <span className="font-label-md text-label-md text-on-surface">FFC-8820</span>
                        <span className="font-label-sm text-label-sm text-outline">Exp: Dec 2027</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-body-md text-body-md text-on-surface">85 Bags</td>
                    <td className="py-3 px-4 text-right font-currency-cell text-currency-cell text-on-surface">
                      Rs. 892,500
                    </td>
                  </tr>

                  <tr className="hover:bg-surface-container-low/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">
                          <span className="material-symbols-outlined text-[18px]">pest_control</span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-body-md text-body-md font-semibold text-on-surface truncate">
                            Chlorpyrifos 40% EC (1000ml)
                          </span>
                          <span className="font-label-sm text-label-sm text-outline">
                            Broad-Spectrum Organophosphate
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-label-sm text-label-sm bg-surface-container-high text-primary px-2.5 py-1 rounded-full font-medium">
                        Pesticide
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-col">
                        <span className="font-label-md text-label-md text-on-surface">CP-1049</span>
                        <span className="font-label-sm text-label-sm text-outline">Exp: Jan 2026</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-body-md text-body-md text-on-surface">64 Bottles</td>
                    <td className="py-3 px-4 text-right font-currency-cell text-currency-cell text-on-surface">
                      Rs. 54,400
                    </td>
                  </tr>

                  <tr className="bg-surface-container-low/20 hover:bg-surface-container-low/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-tertiary-fixed flex items-center justify-center text-tertiary shrink-0">
                          <span className="material-symbols-outlined text-[18px]">grass</span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-body-md text-body-md font-semibold text-on-surface truncate">
                            Glyphosate 41% SL (Isoprop.)
                          </span>
                          <span className="font-label-sm text-label-sm text-outline">
                            Non-Selective Systemic Herbicide
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-label-sm text-label-sm bg-tertiary-fixed-dim/40 text-tertiary px-2.5 py-1 rounded-full font-medium">
                        Herbicide
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-col">
                        <span className="font-label-md text-label-md text-on-surface">GL-7301</span>
                        <span className="font-label-sm text-label-sm text-error font-semibold">Exp: 38 Days</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-body-md text-body-md text-on-surface">39 Liters</td>
                    <td className="py-3 px-4 text-right font-currency-cell text-currency-cell text-on-surface">
                      Rs. 42,900
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN (4 COLS): Ledgers, Action Center, Stock Criticals */}
        <div className="xl:col-span-4 flex flex-col gap-space-xl">
          {/* Fast Actions Hub */}
          <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">Desk Operations</span>
            <h3 className="font-headline-sm text-headline-sm text-on-surface mb-space-sm">Quick Action Dispatch</h3>
            <div className="grid grid-cols-1 gap-2 pt-1">
              <button
                className="w-full flex items-center justify-between p-3 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface transition-all text-left group cursor-pointer"
                type="button"
                onClick={() => navigate('/pos')}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded bg-primary-container text-on-primary flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">post_add</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-lg text-label-lg font-semibold text-on-surface">Create New Tax Invoice</span>
                    <span className="font-label-sm text-label-sm text-outline">Retail pos &amp; print receipt</span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors text-[20px]">
                  chevron_right
                </span>
              </button>

              <button
                className="w-full flex items-center justify-between p-3 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface transition-all text-left group cursor-pointer"
                type="button"
                onClick={() => navigate('/payments')}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded bg-secondary-container text-on-secondary-container flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">price_check</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-lg text-label-lg font-semibold text-on-surface">Record Farmer Payment</span>
                    <span className="font-label-sm text-label-sm text-outline">Khata credit settlement</span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-outline group-hover:text-secondary transition-colors text-[20px]">
                  chevron_right
                </span>
              </button>

              <button
                className="w-full flex items-center justify-between p-3 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface transition-all text-left group cursor-pointer"
                type="button"
                onClick={() => navigate('/inventory')}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded bg-surface-container-highest text-primary flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">move_to_inbox</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-lg text-label-lg font-semibold text-on-surface">Batch Stock Inward (GRN)</span>
                    <span className="font-label-sm text-label-sm text-outline">Receive factory supply</span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors text-[20px]">
                  chevron_right
                </span>
              </button>
            </div>
          </section>

          {/* Outstanding Farmer Khata Card (Top Debts) */}
          <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  Agricultural Credit
                </span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface">Overdue Farmer Khata</h3>
              </div>
              <span className="font-label-sm text-label-sm text-error bg-error-container px-2 py-0.5 rounded-full font-bold">
                Action Urgent
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {/* Farmer 1 */}
              <div className="p-3 bg-surface-container-low rounded-lg flex flex-col gap-2">
                <div className="flex items-start justify-between">
                  <div className="flex flex-col">
                    <span className="font-label-lg text-label-lg text-on-surface font-bold">Chaudhry Riaz</span>
                    <span className="font-label-sm text-label-sm text-outline">Chak 42-NB • 0300-8712394</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="font-currency-cell text-currency-cell text-error">Rs. 145,000</span>
                    <span className="font-label-sm text-label-sm text-error font-medium">45 Days Overdue</span>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    className="px-2.5 py-1 rounded bg-surface-container-lowest text-primary hover:bg-surface-container-high text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    type="button"
                    onClick={() => alert('SMS Reminder sent to Chaudhry Riaz: 0300-8712394')}
                  >
                    <span className="material-symbols-outlined text-[14px]">sms</span>SMS Reminder
                  </button>
                  <button
                    className="px-2.5 py-1 rounded bg-primary text-on-primary text-[11px] font-semibold flex items-center gap-1 hover:bg-primary-container transition-colors cursor-pointer"
                    type="button"
                    onClick={() => navigate('/khata')}
                  >
                    <span className="material-symbols-outlined text-[14px]">visibility</span>Ledger
                  </button>
                </div>
              </div>

              {/* Farmer 2 */}
              <div className="p-3 bg-surface-container-low rounded-lg flex flex-col gap-2">
                <div className="flex items-start justify-between">
                  <div className="flex flex-col">
                    <span className="font-label-lg text-label-lg text-on-surface font-bold">Malik Tariq</span>
                    <span className="font-label-sm text-label-sm text-outline">Kot Momin • 0321-6549821</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="font-currency-cell text-currency-cell text-error">Rs. 84,200</span>
                    <span className="font-label-sm text-label-sm text-outline">Harvest Due</span>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    className="px-2.5 py-1 rounded bg-surface-container-lowest text-primary hover:bg-surface-container-high text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    type="button"
                    onClick={() => alert('SMS Reminder sent to Malik Tariq: 0321-6549821')}
                  >
                    <span className="material-symbols-outlined text-[14px]">sms</span>SMS Reminder
                  </button>
                  <button
                    className="px-2.5 py-1 rounded bg-primary text-on-primary text-[11px] font-semibold flex items-center gap-1 hover:bg-primary-container transition-colors cursor-pointer"
                    type="button"
                    onClick={() => navigate('/khata')}
                  >
                    <span className="material-symbols-outlined text-[14px]">visibility</span>Ledger
                  </button>
                </div>
              </div>

              {/* Farmer 3 */}
              <div className="p-3 bg-surface-container-low rounded-lg flex flex-col gap-2">
                <div className="flex items-start justify-between">
                  <div className="flex flex-col">
                    <span className="font-label-lg text-label-lg text-on-surface font-bold">Haji Munir</span>
                    <span className="font-label-sm text-label-sm text-outline">Bhalwal Citrus Estate • 0345-7193021</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="font-currency-cell text-currency-cell text-tertiary">Rs. 62,000</span>
                    <span className="font-label-sm text-label-sm text-outline">Partially Paid</span>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    className="px-2.5 py-1 rounded bg-surface-container-lowest text-primary hover:bg-surface-container-high text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    type="button"
                    onClick={() => alert('SMS Reminder sent to Haji Munir: 0345-7193021')}
                  >
                    <span className="material-symbols-outlined text-[14px]">sms</span>SMS Reminder
                  </button>
                  <button
                    className="px-2.5 py-1 rounded bg-primary text-on-primary text-[11px] font-semibold flex items-center gap-1 hover:bg-primary-container transition-colors cursor-pointer"
                    type="button"
                    onClick={() => navigate('/khata')}
                  >
                    <span className="material-symbols-outlined text-[14px]">visibility</span>Ledger
                  </button>
                </div>
              </div>
            </div>

            <Link
              to="/khata"
              className="w-full py-2 text-center rounded-lg bg-surface-container-low hover:bg-surface-container font-label-md text-label-md text-primary font-semibold transition-colors block"
            >
              View All 38 Farmer Accounts
            </Link>
          </section>

          {/* Low Stock & Critical Watchlist */}
          <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">Safety Stock</span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface">Depleting Inventory</h3>
              </div>
              <span className="material-symbols-outlined text-outline text-[20px]">inventory</span>
            </div>

            <div className="flex flex-col gap-space-md">
              {/* Item 1 */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-on-surface">
                  <span className="font-label-md text-label-md font-semibold truncate pr-2">Cartap Hydrochloride 4G</span>
                  <span className="font-label-sm text-label-sm text-error font-bold">6 / 30 Bags Left</span>
                </div>
                <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
                  <div className="h-full bg-error rounded-full" style={{ width: '20%' }}></div>
                </div>
                <span className="font-label-sm text-label-sm text-outline">Paddy borer season • Reorder 50 units</span>
              </div>

              {/* Item 2 */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-on-surface">
                  <span className="font-label-md text-label-md font-semibold truncate pr-2">Glyphosate 41% SL (1L)</span>
                  <span className="font-label-sm text-label-sm text-tertiary font-bold">4 / 40 Cans Left</span>
                </div>
                <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
                  <div className="h-full bg-tertiary-fixed-dim rounded-full" style={{ width: '10%' }}></div>
                </div>
                <span className="font-label-sm text-label-sm text-outline">Wheat land prep active • Vendor: ICI</span>
              </div>

              {/* Item 3 */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-on-surface">
                  <span className="font-label-md text-label-md font-semibold truncate pr-2">Zinc Sulphate 33% 3kg</span>
                  <span className="font-label-sm text-label-sm text-tertiary font-bold">9 / 50 Packs Left</span>
                </div>
                <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
                  <div className="h-full bg-tertiary-fixed-dim rounded-full" style={{ width: '18%' }}></div>
                </div>
                <span className="font-label-sm text-label-sm text-outline">Micronutrient reorder pending approval</span>
              </div>
            </div>

            <button
              className="w-full py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-primary font-label-md text-label-md font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              type="button"
              onClick={() => navigate('/purchases')}
            >
              <span className="material-symbols-outlined text-[16px]">add_business</span>
              <span>Generate Supplier Purchase Order</span>
            </button>
          </section>

          {/* Store Status & Warehouse Climate Brief */}
          <section className="bg-gradient-to-br from-primary to-primary-container text-on-primary rounded-xl p-space-lg shadow-md flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-on-primary-container font-semibold uppercase tracking-wider">
                Depot Conditions
              </span>
              <span className="font-headline-sm text-headline-sm text-on-primary mt-1">Chemical Store #1</span>
              <div className="flex items-center gap-space-md mt-2 text-on-primary/90 font-label-sm text-label-sm">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px]">device_thermostat</span>24.2°C
                </span>
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px]">humidity_percentage</span>52% RH
                </span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-full bg-on-primary/10 flex items-center justify-center text-on-primary">
              <span className="material-symbols-outlined text-[26px]">ac_unit</span>
            </div>
          </section>
        </div>
      </div>
    </div>
    </PageTransition>
  );
};

export default DashboardPage;
