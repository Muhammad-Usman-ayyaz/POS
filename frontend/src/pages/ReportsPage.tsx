import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notify } from '@/lib/notify';

interface ReportCard {
  id: string;
  category: 'sales' | 'purchases' | 'inventory' | 'khata' | 'tax';
  badge: string;
  badgeType: 'emerald' | 'amber' | 'blue' | 'gray' | 'red';
  icon: string;
  title: string;
  desc: string;
  meta: string;
  metaColor?: string;
  lastRun: string;
}

const REPORT_CARDS: ReportCard[] = [
  {
    id: 'rep-01',
    category: 'sales',
    badge: 'Daily / Instant',
    badgeType: 'emerald',
    icon: 'point_of_sale',
    title: 'Daily Sales & Cashier Settlement',
    desc: 'POS Drawer #1 & #2 reconciliation, JazzCash merchant receipts, counter cash deficit check, and Khata slips log.',
    meta: 'Auto-Refreshes: 10m ago',
    lastRun: 'Today, 04:30 PM',
  },
  {
    id: 'rep-02',
    category: 'khata',
    badge: 'Weekly / Risk Audit',
    badgeType: 'amber',
    icon: 'person_alert',
    title: 'Farmer Khata Aging & Delinquency',
    desc: 'Bucketed credit aging schedule (Current, 30, 60, 90+ days), credit ceiling violations, and recovery progress notes.',
    meta: 'Rs. 2.85M flagged',
    metaColor: 'text-error',
    lastRun: '14 Oct 2024',
  },
  {
    id: 'rep-03',
    category: 'inventory',
    badge: 'Compliance',
    badgeType: 'blue',
    icon: 'vaccines',
    title: 'Inventory Expiry & Batch Health',
    desc: 'Batches expiring <60 and <90 days, active ingredient degradation risks, and consignment return claims.',
    meta: '14 Batches critical',
    lastRun: '12 Oct 2024',
  },
  {
    id: 'rep-04',
    category: 'purchases',
    badge: 'Monthly',
    badgeType: 'gray',
    icon: 'local_shipping',
    title: 'Supplier Consignment & Inward Log',
    desc: 'Bilty freight audit, trade promotion discounts, distributor payment cycle settlements, and gross purchase margins.',
    meta: 'FMC & Syngenta active',
    lastRun: '01 Oct 2024',
  },
  {
    id: 'rep-05',
    category: 'tax',
    badge: 'FBR Tax Form',
    badgeType: 'red',
    icon: 'receipt_long',
    title: 'Sales Tax & FBR e-Invoice Register',
    desc: '0% Agri-exempt fertilizer vs. 18% standard chemical split, verified FBR QR verification hashes, Annexure-C export.',
    meta: '100% STRN Compliant',
    metaColor: 'text-primary',
    lastRun: '15 Oct 2024',
  },
  {
    id: 'rep-06',
    category: 'sales',
    badge: 'Strategic',
    badgeType: 'blue',
    icon: 'pie_chart',
    title: 'Formulation Profitability Matrix',
    desc: 'Comparative margin yield: Insecticides (28.4%) vs Granular Herbicides (14.2%) vs Trace Micronutrients (31.5%).',
    meta: 'Updated for Oct Rabi',
    lastRun: '10 Oct 2024',
  },
];

export const ReportsPage: React.FC = () => {
  const navigate = useNavigate();

  // Filter state
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSeason, setSelectedSeason] = useState<string>('Rabi 2024-25');
  const [seasonDropdownOpen, setSeasonDropdownOpen] = useState<boolean>(false);

  // Modals
  const [activeReportModal, setActiveReportModal] = useState<ReportCard | null>(null);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState<boolean>(false);

  // Filtered reports
  const filteredReports = REPORT_CARDS.filter((card) => {
    const matchesCategory = selectedCategory === 'all' || card.category === selectedCategory;
    const matchesSearch =
      card.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.badge.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const showToast = (msg: string) => notify(msg);

  const exportExcel = () => {
    const rows = [
      ['Report Title', 'Category', 'Frequency', 'Meta Summary', 'Last Run'],
      ...REPORT_CARDS.map((r) => [r.title, r.category, r.badge, r.meta, r.lastRun]),
    ];
    const csvContent =
      'data:text/csv;charset=utf-8,' + rows.map((e) => e.map((cell) => `"${cell}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Agri_Business_Reports_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Report catalog exported as CSV spreadsheet.');
  };

  return (
    <div className="flex flex-col w-full text-on-surface">

      {/* Top Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-space-lg mb-margin-lg">
        <div className="flex flex-col">
          <div className="flex items-center gap-space-xs font-label-md text-label-md text-outline mb-1">
            <span>Management</span>
            <span className="text-outline-variant">/</span>
            <span className="text-primary font-semibold">Reports &amp; Analytics</span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
            Agri-Business Reports &amp; Financial Analytics
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl mt-0.5">
            Generate statutory tax audit filings, seasonal crop turnover summaries, customer khata aging, and
            inventory valuation statements.
          </p>
        </div>

        {/* Header Actions & Season Range Selector */}
        <div className="flex flex-wrap items-center gap-space-sm shrink-0">
          <div className="relative inline-flex items-center">
            <button
              className="h-[38px] px-space-md bg-surface-container-lowest border border-line rounded-lg font-label-md text-label-md text-on-surface flex items-center gap-2 hover:bg-surface-container-low transition-colors shadow-sm"
              type="button"
              onClick={() => setSeasonDropdownOpen(!seasonDropdownOpen)}
            >
              <span className="material-symbols-outlined text-[18px] text-primary">calendar_month</span>
              <span className="font-semibold">Current {selectedSeason} (01 Oct - 15 Oct)</span>
              <span className="material-symbols-outlined text-[16px] text-outline">expand_more</span>
            </button>
            {seasonDropdownOpen && (
              <div className="absolute top-full mt-1.5 left-0 w-72 bg-surface-container-lowest border border-line rounded-xl shadow-xl z-30 py-1 font-label-md text-label-md">
                <button
                  className="w-full text-left px-3 py-2 hover:bg-surface-container-low flex items-center justify-between"
                  onClick={() => {
                    setSelectedSeason('Rabi Season 2024-25');
                    setSeasonDropdownOpen(false);
                  }}
                >
                  <span>Rabi Season 2024-25 (Current)</span>
                  {selectedSeason.includes('Rabi') && (
                    <span className="material-symbols-outlined text-primary text-[18px]">check</span>
                  )}
                </button>
                <button
                  className="w-full text-left px-3 py-2 hover:bg-surface-container-low flex items-center justify-between"
                  onClick={() => {
                    setSelectedSeason('Kharif Season 2024');
                    setSeasonDropdownOpen(false);
                  }}
                >
                  <span>Kharif Season 2024</span>
                  {selectedSeason.includes('Kharif') && (
                    <span className="material-symbols-outlined text-primary text-[18px]">check</span>
                  )}
                </button>
                <button
                  className="w-full text-left px-3 py-2 hover:bg-surface-container-low flex items-center justify-between"
                  onClick={() => {
                    setSelectedSeason('Annual FY 2023-24');
                    setSeasonDropdownOpen(false);
                  }}
                >
                  <span>Annual FY 2023-24</span>
                  {selectedSeason.includes('Annual') && (
                    <span className="material-symbols-outlined text-primary text-[18px]">check</span>
                  )}
                </button>
              </div>
            )}
          </div>

          <button
            className="h-[38px] px-space-sm bg-surface-container-lowest border border-line rounded-lg font-label-md text-label-md text-on-surface hover:bg-surface-container-low transition-colors flex items-center gap-1.5 shadow-sm"
            title="Download Excel"
            type="button"
            onClick={exportExcel}
          >
            <span className="material-symbols-outlined text-[18px] text-primary">table_chart</span>
            <span>Export Excel</span>
          </button>

          <button
            className="h-[38px] px-space-sm bg-surface-container-lowest border border-line rounded-lg font-label-md text-label-md text-on-surface hover:bg-surface-container-low transition-colors flex items-center gap-1.5 shadow-sm"
            title="Download Complete Dossier"
            type="button"
            onClick={() => window.print()}
          >
            <span className="material-symbols-outlined text-[18px] text-error">picture_as_pdf</span>
            <span>PDF Dossier</span>
          </button>

          <button
            className="h-[38px] px-space-md bg-primary text-on-primary rounded-lg font-label-md text-label-md hover:bg-primary-container transition-colors flex items-center gap-1.5 shadow-sm"
            type="button"
            onClick={() => setIsScheduleModalOpen(true)}
          >
            <span className="material-symbols-outlined text-[18px]">schedule_send</span>
            <span>Schedule Report</span>
          </button>
        </div>
      </div>

      {/* Analytical KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-lg mb-margin-lg">
        {/* Total Gross Revenue */}
        <div className="bg-surface-container-lowest border border-line rounded-xl p-space-lg shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -right-2 -bottom-2 opacity-5 pointer-events-none">
            <span className="material-symbols-outlined text-[96px] text-primary">payments</span>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline font-semibold">
                Total Gross Revenue
              </span>
              <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-success-soft text-success border border-success-line font-semibold flex items-center gap-0.5">
                <span className="material-symbols-outlined text-[12px]">trending_up</span>+18.4%
              </span>
            </div>
            <div className="font-currency-stat text-currency-stat text-on-surface font-bold tracking-tight">
              Rs. 24,850,000
            </div>
          </div>
          <div className="mt-space-md pt-space-xs border-t border-line flex items-center justify-between text-outline">
            <span className="font-body-sm text-body-sm">Season to Date (Rabi Peak)</span>
            <span className="font-label-sm text-label-sm text-primary font-medium">vs Kharif 2024</span>
          </div>
        </div>

        {/* Realized Net Cashflow */}
        <div className="bg-surface-container-lowest border border-line rounded-xl p-space-lg shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -right-2 -bottom-2 opacity-5 pointer-events-none">
            <span className="material-symbols-outlined text-[96px] text-secondary">account_balance_wallet</span>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline font-semibold">
                Realized Net Cashflow
              </span>
              <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-surface-container-high text-primary border border-outline-variant font-semibold">
                74.1% Liquidity
              </span>
            </div>
            <div className="font-currency-stat text-currency-stat text-primary font-bold tracking-tight">
              Rs. 18,420,000
            </div>
          </div>
          <div className="mt-space-md pt-space-xs border-t border-line flex items-center justify-between text-outline">
            <span className="font-body-sm text-body-sm">Cash, Bank &amp; JazzCash Settlements</span>
            <span className="font-label-sm text-label-sm text-secondary font-medium">High Solvent</span>
          </div>
        </div>

        {/* Khata Receivables at Risk */}
        <div className="bg-surface-container-lowest border border-line rounded-xl p-space-lg shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -right-2 -bottom-2 opacity-5 pointer-events-none">
            <span className="material-symbols-outlined text-[96px] text-error">warning</span>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline font-semibold">
                Receivables at Risk (&gt;45D)
              </span>
              <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-danger-soft text-danger border border-danger-line font-semibold">
                11.5% Exposure
              </span>
            </div>
            <div className="font-currency-stat text-currency-stat text-error font-bold tracking-tight">
              Rs. 2,850,000
            </div>
          </div>
          <div className="mt-space-md pt-space-xs border-t border-line flex items-center justify-between text-outline">
            <span className="font-body-sm text-body-sm">28 Farmer Ledgers overdue</span>
            <button
              onClick={() => navigate('/khata')}
              className="font-label-sm text-label-sm text-error hover:underline font-semibold"
            >
              View Khata →
            </button>
          </div>
        </div>

        {/* Inventory Valuation (FIFO) */}
        <div className="bg-surface-container-lowest border border-line rounded-xl p-space-lg shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -right-2 -bottom-2 opacity-5 pointer-events-none">
            <span className="material-symbols-outlined text-[96px] text-primary">inventory_2</span>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline font-semibold">
                Inventory Valuation (FIFO)
              </span>
              <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-surface-container-low text-on-surface-variant border border-outline-variant font-medium">
                2 Depots Audit
              </span>
            </div>
            <div className="font-currency-stat text-currency-stat text-on-surface font-bold tracking-tight">
              Rs. 14,890,000
            </div>
          </div>
          <div className="mt-space-md pt-space-xs border-t border-line flex items-center justify-between text-outline">
            <span className="font-body-sm text-body-sm">3,420 Verified Commercial Packs</span>
            <span className="font-label-sm text-label-sm text-primary font-semibold">Reconciled</span>
          </div>
        </div>
      </div>

      {/* Filter & Categories Matrix Bar */}
      <div className="bg-surface-container-lowest border border-line rounded-xl p-space-md mb-margin-lg shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-space-md">
        {/* Tab Controls */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0" id="reportTabs">
          <button
            className={`px-space-md py-1.5 rounded-lg font-label-md text-label-md font-semibold shrink-0 shadow-sm transition-colors ${
              selectedCategory === 'all'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:bg-surface-container-low font-medium'
            }`}
            type="button"
            onClick={() => setSelectedCategory('all')}
          >
            All Reports (38)
          </button>
          <button
            className={`px-space-md py-1.5 rounded-lg font-label-md text-label-md shrink-0 transition-colors ${
              selectedCategory === 'sales'
                ? 'bg-primary text-on-primary font-semibold'
                : 'text-on-surface-variant hover:bg-surface-container-low font-medium'
            }`}
            type="button"
            onClick={() => setSelectedCategory('sales')}
          >
            Sales &amp; Revenue
          </button>
          <button
            className={`px-space-md py-1.5 rounded-lg font-label-md text-label-md shrink-0 transition-colors ${
              selectedCategory === 'purchases'
                ? 'bg-primary text-on-primary font-semibold'
                : 'text-on-surface-variant hover:bg-surface-container-low font-medium'
            }`}
            type="button"
            onClick={() => setSelectedCategory('purchases')}
          >
            Purchases &amp; Logistics
          </button>
          <button
            className={`px-space-md py-1.5 rounded-lg font-label-md text-label-md shrink-0 transition-colors ${
              selectedCategory === 'inventory'
                ? 'bg-primary text-on-primary font-semibold'
                : 'text-on-surface-variant hover:bg-surface-container-low font-medium'
            }`}
            type="button"
            onClick={() => setSelectedCategory('inventory')}
          >
            Inventory &amp; Valuation
          </button>
          <button
            className={`px-space-md py-1.5 rounded-lg font-label-md text-label-md shrink-0 transition-colors ${
              selectedCategory === 'khata'
                ? 'bg-primary text-on-primary font-semibold'
                : 'text-on-surface-variant hover:bg-surface-container-low font-medium'
            }`}
            type="button"
            onClick={() => setSelectedCategory('khata')}
          >
            Farmer Khata &amp; Credit
          </button>
          <button
            className={`px-space-md py-1.5 rounded-lg font-label-md text-label-md shrink-0 transition-colors flex items-center gap-1 ${
              selectedCategory === 'tax'
                ? 'bg-primary text-on-primary font-semibold'
                : 'text-on-surface-variant hover:bg-surface-container-low font-medium'
            }`}
            type="button"
            onClick={() => setSelectedCategory('tax')}
          >
            <span>Tax &amp; Statutory (FBR/PRA)</span>
            <span className="w-2 h-2 rounded-full bg-error"></span>
          </button>
        </div>

        {/* Quick Search within Reports */}
        <div className="relative w-full md:w-72 shrink-0">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-outline text-[18px]">search</span>
          <input
            className="w-full h-[36px] pl-9 pr-3 rounded-lg border border-line bg-surface font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
            placeholder="Filter reports or statutory codes..."
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Core Analytics & Visual Breakdowns (Two Columns: 8 / 4 Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg mb-margin-lg">
        {/* Left Column (8 cols): Charts & Quick Generation Grid */}
        <div className="lg:col-span-8 flex flex-col gap-space-lg">
          {/* Interactive Seasonal Trajectory Chart */}
          <div className="bg-surface-container-lowest border border-line rounded-xl p-space-lg shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-space-md border-b border-line gap-space-sm mb-space-md">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    Seasonal Revenue &amp; Margin Trajectory
                  </span>
                  <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-info-soft text-primary border border-info-line font-semibold">
                    October Rabi Pulse
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-outline mt-0.5">
                  Weekly revenue volume (Lakhs PKR) correlated with Gross Margin % during Wheat sowing preparation
                </p>
              </div>
              <div className="flex items-center gap-4 text-body-sm">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-primary"></span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">Revenue (Lakhs)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-secondary"></span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">Gross Margin (%)</span>
                </div>
              </div>
            </div>

            {/* SVG Line/Area Graph */}
            <div className="relative w-full h-[220px]">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 760 200">
                <defs>
                  <linearGradient id="primaryAreaGrad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--erp-primary)" stopOpacity="0.22"></stop>
                    <stop offset="100%" stopColor="var(--erp-primary)" stopOpacity="0.01"></stop>
                  </linearGradient>
                </defs>
                {/* Grid Lines */}
                <line stroke="var(--erp-surface-container-high)" strokeDasharray="3 3" strokeWidth="1" x1="40" x2="740" y1="30"></line>
                <line stroke="var(--erp-surface-container-high)" strokeDasharray="3 3" strokeWidth="1" x1="40" x2="740" y1="80"></line>
                <line stroke="var(--erp-surface-container-high)" strokeDasharray="3 3" strokeWidth="1" x1="40" x2="740" y1="130"></line>
                <line stroke="var(--erp-surface-container-high)" strokeWidth="1" x1="40" x2="740" y1="175"></line>

                {/* Y Axis Labels */}
                <text fill="var(--erp-outline)" fontFamily="Inter" fontSize="11" textAnchor="end" x="32" y="34">
                  75L
                </text>
                <text fill="var(--erp-outline)" fontFamily="Inter" fontSize="11" textAnchor="end" x="32" y="84">
                  50L
                </text>
                <text fill="var(--erp-outline)" fontFamily="Inter" fontSize="11" textAnchor="end" x="32" y="134">
                  25L
                </text>
                <text fill="var(--erp-outline)" fontFamily="Inter" fontSize="11" textAnchor="end" x="32" y="178">
                  0L
                </text>

                {/* Revenue Filled Area */}
                <path
                  d="M 60 155 Q 150 140 230 115 T 400 85 T 570 45 T 720 38 L 720 175 L 60 175 Z"
                  fill="url(#primaryAreaGrad)"
                ></path>
                {/* Revenue Line */}
                <path
                  d="M 60 155 Q 150 140 230 115 T 400 85 T 570 45 T 720 38"
                  fill="none"
                  stroke="var(--erp-primary)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                ></path>
                {/* Gross Margin Line (Secondary - Green) */}
                <path
                  d="M 60 130 Q 150 120 230 100 T 400 95 T 570 75 T 720 65"
                  fill="none"
                  stroke="var(--erp-primary-container)"
                  strokeDasharray="4 2"
                  strokeLinecap="round"
                  strokeWidth="2.5"
                ></path>

                {/* Sowing Peak Callout Marker at Week 3 */}
                <line
                  stroke="var(--erp-primary)"
                  strokeDasharray="2 2"
                  strokeWidth="1.5"
                  x1="570"
                  x2="570"
                  y1="20"
                  y2="175"
                ></line>
                <circle cx="570" cy="45" fill="var(--erp-primary)" r="5" stroke="var(--erp-surface-container-lowest)" strokeWidth="2"></circle>
                <circle cx="570" cy="75" fill="var(--erp-primary-container)" r="4" stroke="var(--erp-surface-container-lowest)" strokeWidth="1.5"></circle>

                {/* X Axis Markers */}
                <text fill="var(--erp-on-surface-variant)" fontFamily="Inter" fontSize="11" fontWeight="500" textAnchor="middle" x="60" y="194">
                  Week 1 (Oct 01)
                </text>
                <text fill="var(--erp-on-surface-variant)" fontFamily="Inter" fontSize="11" fontWeight="500" textAnchor="middle" x="230" y="194">
                  Week 2 (Oct 05)
                </text>
                <text fill="var(--erp-on-surface-variant)" fontFamily="Inter" fontSize="11" fontWeight="500" textAnchor="middle" x="400" y="194">
                  Week 3 (Oct 10)
                </text>
                <text fill="var(--erp-primary)" fontFamily="Inter" fontSize="11" fontWeight="700" textAnchor="middle" x="570" y="194">
                  Peak Wheat Sowing
                </text>
                <text fill="var(--erp-on-surface-variant)" fontFamily="Inter" fontSize="11" fontWeight="500" textAnchor="middle" x="720" y="194">
                  Mid Oct (Current)
                </text>
              </svg>

              {/* Floating Micro Badge Annotation */}
              <div className="absolute top-2 right-12 bg-surface-container-high px-2 py-1 rounded shadow-sm flex items-center gap-1 border border-outline-variant">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                <span className="font-label-sm text-label-sm text-primary font-bold">22.4% Avg GM</span>
              </div>
            </div>
          </div>

          {/* Popular Report Quick-Generation Grid (6 Bespoke Cards) */}
          <div>
            <div className="flex items-center justify-between mb-space-sm">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">bolt</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  Instant Operational &amp; Audit Reports
                </h2>
              </div>
              <span className="font-label-sm text-label-sm text-outline">Click &apos;Run Report&apos; for live data refresh</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
              {filteredReports.map((report) => (
                <div
                  key={report.id}
                  className="bg-surface-container-lowest border border-line rounded-xl p-space-md shadow-sm hover:border-primary transition-all flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          report.badgeType === 'amber'
                            ? 'bg-danger-soft text-error'
                            : 'bg-surface-container-low text-primary'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[20px]">{report.icon}</span>
                      </div>
                      <span
                        className={`font-label-sm text-label-sm px-2 py-0.5 rounded-full font-semibold border ${
                          report.badgeType === 'emerald'
                            ? 'bg-success-soft text-success border-success-line'
                            : report.badgeType === 'amber'
                            ? 'bg-warning-soft text-warning border-warning-line'
                            : report.badgeType === 'blue'
                            ? 'bg-info-soft text-primary border-info-line'
                            : report.badgeType === 'red'
                            ? 'bg-danger-soft text-danger border-danger-line'
                            : 'bg-surface-container-high text-on-surface-variant border-outline-variant'
                        }`}
                      >
                        {report.badge}
                      </span>
                    </div>
                    <h3 className="font-label-lg text-label-lg text-on-surface font-bold">{report.title}</h3>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{report.desc}</p>
                  </div>
                  <div className="pt-space-md mt-space-md border-t border-line flex items-center justify-between">
                    <span className={`font-label-sm text-label-sm ${report.metaColor || 'text-outline'}`}>
                      {report.meta}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        className="h-8 px-2.5 rounded bg-surface-container-low hover:bg-surface-container-high text-on-surface font-label-sm text-label-sm font-semibold transition-colors"
                        title="Preview Summary"
                        type="button"
                        onClick={() => setActiveReportModal(report)}
                      >
                        Preview
                      </button>
                      <button
                        className="h-8 px-3 rounded bg-primary hover:bg-primary-container text-on-primary font-label-sm text-label-sm font-semibold flex items-center gap-1 transition-colors"
                        type="button"
                        onClick={() => showToast(`Executing ${report.title}... Data refreshed!`)}
                      >
                        <span className="material-symbols-outlined text-[15px]">play_arrow</span>
                        <span>Run Report</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column (4 cols): Scheduled Automations & Regulatory Compliance Dossier */}
        <div className="lg:col-span-4 flex flex-col gap-space-lg">
          {/* Regulatory & Audit Compliance Dossier Card */}
          <div className="bg-surface-container-lowest border border-line rounded-xl p-space-lg shadow-sm">
            <div className="flex items-center gap-space-sm mb-space-sm">
              <div className="w-10 h-10 rounded-lg bg-success-soft border border-success-line flex items-center justify-center text-success shrink-0">
                <span className="material-symbols-outlined text-[24px]">verified_user</span>
              </div>
              <div className="flex flex-col">
                <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  Statutory Audit Status
                </span>
                <span className="font-label-sm text-label-sm text-success font-semibold">
                  Punjab Pesticide Ordinance 1971
                </span>
              </div>
            </div>

            <div className="space-y-space-sm my-space-md bg-surface-container-low p-space-md rounded-lg text-body-sm text-on-surface-variant">
              <div className="flex items-center justify-between text-body-sm">
                <span className="text-outline">Formulation Inspection:</span>
                <span className="font-label-sm text-label-sm text-success font-semibold flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  <span>PASSED (Sample #PAD-9812)</span>
                </span>
              </div>
              <div className="flex items-center justify-between text-body-sm">
                <span className="text-outline">FBR STRN e-Filing:</span>
                <span className="font-label-sm text-label-sm text-primary font-semibold">Active (Sync: 12 Oct)</span>
              </div>
              <div className="flex items-center justify-between text-body-sm">
                <span className="text-outline">Punjab Agri License:</span>
                <span className="font-label-sm text-label-sm text-on-surface font-mono">#FSD-AG-2021-998</span>
              </div>
              <div className="flex items-center justify-between text-body-sm">
                <span className="text-outline">License Expiry:</span>
                <span className="font-label-sm text-label-sm text-success font-semibold">31 Dec 2025 (Valid)</span>
              </div>
              <div className="flex items-center justify-between text-body-sm">
                <span className="text-outline">Quality Control Lab:</span>
                <span className="font-label-sm text-label-sm text-on-surface">Grade-A Certified</span>
              </div>
            </div>

            <button
              className="w-full h-10 rounded-lg bg-surface-container-low hover:bg-surface-container text-primary font-label-md text-label-md font-semibold flex items-center justify-center gap-1.5 transition-colors border border-outline-variant"
              type="button"
              onClick={() => showToast('Full Statutory Audit Dossier compiled and downloaded.')}
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              <span>Export Compliance Packet</span>
            </button>
          </div>

          {/* Scheduled Report Automations Card */}
          <div className="bg-surface-container-lowest border border-line rounded-xl p-space-lg shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-space-sm">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[22px]">schedule</span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    Active Automations (3)
                  </h3>
                </div>
                <span className="font-label-sm text-label-sm text-secondary font-semibold bg-success-soft px-2 py-0.5 rounded-full">
                  Running
                </span>
              </div>
              <p className="font-body-sm text-body-sm text-outline mb-space-md">
                Automated background dispatch to shop proprietor &amp; auditor emails/WhatsApp.
              </p>

              <div className="space-y-space-sm">
                {/* Job 1 */}
                <div className="p-space-sm rounded-lg bg-surface-container-low border border-outline-variant flex items-start justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface font-semibold">
                      Weekly Khata Aging &amp; Overdue Risk
                    </span>
                    <span className="font-body-sm text-body-sm text-outline">
                      Mondays @ 09:00 AM • WhatsApp (+92 300 8712394)
                    </span>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-secondary shrink-0 mt-1.5"></span>
                </div>

                {/* Job 2 */}
                <div className="p-space-sm rounded-lg bg-surface-container-low border border-outline-variant flex items-start justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface font-semibold">
                      Daily Cashier Register Settlement
                    </span>
                    <span className="font-body-sm text-body-sm text-outline">
                      Daily @ 08:30 PM • Email (muhammad@pesticideclub.pk)
                    </span>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-secondary shrink-0 mt-1.5"></span>
                </div>

                {/* Job 3 */}
                <div className="p-space-sm rounded-lg bg-surface-container-low border border-outline-variant flex items-start justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface font-semibold">
                      Monthly FBR Sales Tax Return Annex-C
                    </span>
                    <span className="font-body-sm text-body-sm text-outline">
                      15th of month @ 10:00 AM • Auditor Portal
                    </span>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-secondary shrink-0 mt-1.5"></span>
                </div>
              </div>
            </div>

            <button
              className="mt-space-lg w-full h-10 rounded-lg bg-primary-container text-on-primary font-label-md text-label-md font-semibold flex items-center justify-center gap-1.5 hover:bg-primary transition-colors shadow-sm"
              type="button"
              onClick={() => setIsScheduleModalOpen(true)}
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              <span>Configure New Automation</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal 1: Report Preview Modal */}
      {activeReportModal && (
        <div className="fixed inset-0 z-50 bg-inverse-surface/40 backdrop-blur-xs flex items-center justify-center p-gutter animate-in fade-in-0 duration-150">
          <div className="bg-surface-container-lowest w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col erp-animate-pop border border-outline-variant/30">
            <div className="px-space-xl py-space-md bg-surface-container-low flex items-center justify-between border-b border-line">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">{activeReportModal.icon}</span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  {activeReportModal.title}
                </span>
              </div>
              <button
                className="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center text-outline erp-btn-press"
                onClick={() => setActiveReportModal(null)}
                type="button"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="p-space-xl flex flex-col gap-space-md max-h-[70vh] overflow-y-auto">
              <div className="flex items-center justify-between bg-surface-container-low p-space-md rounded-xl">
                <div>
                  <span className="font-label-sm text-label-sm text-outline uppercase">Report Metadata</span>
                  <div className="font-label-md text-label-md text-on-surface font-semibold mt-0.5">
                    {activeReportModal.desc}
                  </div>
                </div>
                <span className="font-label-sm text-label-sm px-2.5 py-1 rounded-full bg-success-soft text-success font-semibold shrink-0">
                  {activeReportModal.badge}
                </span>
              </div>

              {/* Sample Output Table */}
              <div className="border border-line rounded-xl overflow-hidden">
                <table className="w-full text-left font-body-sm text-body-sm">
                  <thead>
                    <tr className="bg-surface-container-low font-label-sm text-label-sm text-outline uppercase">
                      <th className="py-2.5 px-3">Item / Farmer</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3 text-right">Volume</th>
                      <th className="py-2.5 px-3 text-right">Amount (PKR)</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-on-surface">Zorawar DAP Fertilizer (50kg)</td>
                      <td className="py-2.5 px-3 text-outline">Phosphatic Fertilizer</td>
                      <td className="py-2.5 px-3 text-right">180 Bags</td>
                      <td className="py-2.5 px-3 text-right font-semibold">Rs. 1,953,000</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-label-sm bg-success-soft text-success font-medium">
                          Active
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-on-surface">Confidor 200 SL (250ml)</td>
                      <td className="py-2.5 px-3 text-outline">Systemic Insecticide</td>
                      <td className="py-2.5 px-3 text-right">84 Bottles</td>
                      <td className="py-2.5 px-3 text-right font-semibold">Rs. 138,600</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-label-sm bg-info-soft text-primary font-medium">
                          In Stock
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-on-surface">Cartap Hydrochloride 4G</td>
                      <td className="py-2.5 px-3 text-outline">Granular Rice/Wheat</td>
                      <td className="py-2.5 px-3 text-right">45 Packs</td>
                      <td className="py-2.5 px-3 text-right font-semibold">Rs. 202,500</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-label-sm bg-success-soft text-success font-medium">
                          Active
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-space-xl py-space-md bg-surface-container-low flex items-center justify-between border-t border-line">
              <span className="font-label-sm text-label-sm text-outline">Generated dynamically from Branch DB</span>
              <div className="flex items-center gap-space-sm">
                <button
                  className="h-10 px-space-md rounded-lg bg-surface-container-lowest border border-line text-on-surface font-label-md text-label-md hover:bg-surface-container transition-colors shadow-sm"
                  onClick={() => setActiveReportModal(null)}
                  type="button"
                >
                  Close
                </button>
                <button
                  className="h-10 px-space-md rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-colors shadow-sm flex items-center gap-1.5"
                  onClick={() => {
                    showToast(`Exporting ${activeReportModal.title} as PDF...`);
                    setActiveReportModal(null);
                  }}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[18px]">download</span>
                  <span>Download Full Report</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Schedule Report Modal */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 bg-inverse-surface/40 backdrop-blur-xs flex items-center justify-center p-gutter animate-in fade-in-0 duration-150">
          <div className="bg-surface-container-lowest w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col erp-animate-pop border border-outline-variant/30">
            <div className="px-space-xl py-space-md bg-surface-container-low flex items-center justify-between border-b border-line">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">schedule_send</span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  Schedule Automated Report
                </span>
              </div>
              <button
                className="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center text-outline erp-btn-press"
                onClick={() => setIsScheduleModalOpen(false)}
                type="button"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="p-space-xl flex flex-col gap-space-md">
              <div>
                <label className="font-label-md text-label-md text-on-surface font-semibold block mb-1">
                  Report Type
                </label>
                <select className="w-full h-10 px-3 rounded-lg border border-line bg-surface font-body-sm text-body-sm text-on-surface focus:outline-none">
                  <option>Daily Sales &amp; Cashier Settlement</option>
                  <option>Farmer Khata Aging &amp; Delinquency</option>
                  <option>Inventory Expiry &amp; Batch Health</option>
                  <option>Sales Tax &amp; FBR e-Invoice Register</option>
                  <option>Formulation Profitability Matrix</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-space-md">
                <div>
                  <label className="font-label-md text-label-md text-on-surface font-semibold block mb-1">
                    Frequency
                  </label>
                  <select className="w-full h-10 px-3 rounded-lg border border-line bg-surface font-body-sm text-body-sm text-on-surface focus:outline-none">
                    <option>Daily (Evening Close)</option>
                    <option>Weekly (Mondays 9 AM)</option>
                    <option>Monthly (1st &amp; 15th)</option>
                  </select>
                </div>
                <div>
                  <label className="font-label-md text-label-md text-on-surface font-semibold block mb-1">
                    Format
                  </label>
                  <select className="w-full h-10 px-3 rounded-lg border border-line bg-surface font-body-sm text-body-sm text-on-surface focus:outline-none">
                    <option>PDF Document</option>
                    <option>Excel (CSV)</option>
                    <option>Both (PDF + Excel)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-label-md text-label-md text-on-surface font-semibold block mb-1">
                  Recipient WhatsApp / Mobile #
                </label>
                <input
                  className="w-full h-10 px-3 rounded-lg border border-line bg-surface font-body-sm text-body-sm text-on-surface focus:outline-none"
                  defaultValue="+92 300 8712394"
                  placeholder="+92 300 0000000"
                  type="text"
                />
              </div>

              <div>
                <label className="font-label-md text-label-md text-on-surface font-semibold block mb-1">
                  Recipient Email
                </label>
                <input
                  className="w-full h-10 px-3 rounded-lg border border-line bg-surface font-body-sm text-body-sm text-on-surface focus:outline-none"
                  defaultValue="muhammad@pesticideclub.pk"
                  placeholder="admin@pesticideclub.pk"
                  type="email"
                />
              </div>
            </div>

            <div className="px-space-xl py-space-md bg-surface-container-low flex items-center justify-end gap-space-sm border-t border-line">
              <button
                className="h-10 px-space-md rounded-lg bg-surface-container-lowest border border-line text-on-surface font-label-md text-label-md hover:bg-surface-container transition-colors shadow-sm"
                onClick={() => setIsScheduleModalOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="h-10 px-space-md rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-colors shadow-sm flex items-center gap-1.5"
                onClick={() => {
                  showToast('Automated schedule saved successfully!');
                  setIsScheduleModalOpen(false);
                }}
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">check</span>
                <span>Save Automation</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsPage;
