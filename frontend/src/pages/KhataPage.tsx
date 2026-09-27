import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { notify } from '@/lib/notify';

interface LedgerEntry {
  id: string;
  date: string;
  docRef: string;
  docType: 'OB' | 'POS' | 'RCP';
  description: string;
  subDescription?: string;
  qty: string;
  debit: number | null;
  credit: number | null;
  runningBalance: number;
  signedBy: string;
  role: string;
  isSystem?: boolean;
}

const LEDGER_DATA: LedgerEntry[] = [
  {
    id: '1',
    date: '01 Sep 2024',
    docRef: 'OB-2024',
    docType: 'OB',
    description: 'Opening Balance Carried Forward (Kharif 2024 Clearance)',
    qty: '—',
    debit: null,
    credit: null,
    runningBalance: 45000,
    signedBy: 'System Auto',
    role: '',
    isSystem: true,
  },
  {
    id: '2',
    date: '05 Sep 2024',
    docRef: 'POS-8910',
    docType: 'POS',
    description: 'Zorawar DAP Fertilizer (50kg Bag) & Cartage',
    subDescription: 'Batch: #FFC-2024-D9 • Sowing basal dressing application',
    qty: '4 Bags',
    debit: 43400,
    credit: null,
    runningBalance: 88400,
    signedBy: 'Tariq Mehmood',
    role: 'Counter Sales',
  },
  {
    id: '3',
    date: '15 Sep 2024',
    docRef: 'RCP-8840',
    docType: 'RCP',
    description: 'Cash Settlement at Grain Mandi Counter',
    subDescription: 'Handed over directly to Shop Owner • Verified Against Khata Book #4',
    qty: '—',
    debit: null,
    credit: 50000,
    runningBalance: 38400,
    signedBy: 'Muhammad Khan',
    role: 'Owner (Admin)',
  },
  {
    id: '4',
    date: '22 Sep 2024',
    docRef: 'POS-9120',
    docType: 'POS',
    description: 'Coragen 20 SC (50ml) & Confidor 200SL (Bayer)',
    subDescription: '4x Coragen (FMC) + 2x Confidor • Sugarcane borer & aphid treatment',
    qty: '6 Bottles',
    debit: 15200,
    credit: null,
    runningBalance: 53600,
    signedBy: 'Tariq Mehmood',
    role: 'Counter Sales',
  },
  {
    id: '5',
    date: '28 Sep 2024',
    docRef: 'POS-9304',
    docType: 'POS',
    description: 'Match 050 EC (500ml Canister) - Syngenta',
    subDescription: 'Lufenuron IGR spray for armyworm prevention',
    qty: '4 Cans',
    debit: 11800,
    credit: null,
    runningBalance: 65400,
    signedBy: 'Tariq Mehmood',
    role: 'Counter Sales',
  },
  {
    id: '6',
    date: '05 Oct 2024',
    docRef: 'RCP-9012',
    docType: 'RCP',
    description: 'JazzCash Mobile Remittance (Ref: #JC-881903)',
    subDescription: 'Sent from mobile ending in *2394 • Settled directly into Main Bank Account',
    qty: '—',
    debit: null,
    credit: 25000,
    runningBalance: 40400,
    signedBy: 'Shahid Bilal',
    role: 'Branch Accountant',
  },
  {
    id: '7',
    date: '10 Oct 2024',
    docRef: 'POS-9420',
    docType: 'POS',
    description: 'Sona Urea (50kg Bags) & Potassium Sulphate (SOP)',
    subDescription: '10x Sona Prilled Urea + 2x Engro Zarkhez SOP • Delivered via Tractor Trolley',
    qty: '12 Bags',
    debit: 104600,
    credit: null,
    runningBalance: 145000,
    signedBy: 'Tariq Mehmood',
    role: 'Counter Sales',
  },
];

export const KhataPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');

  const showToast = (msg: string) => notify(msg);

  const filteredEntries = useMemo(() => {
    return LEDGER_DATA.filter((item) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        item.description.toLowerCase().includes(q) ||
        (item.subDescription && item.subDescription.toLowerCase().includes(q)) ||
        item.docRef.toLowerCase().includes(q) ||
        item.signedBy.toLowerCase().includes(q);

      let matchesType = true;
      if (filterType === 'debits') matchesType = item.debit !== null;
      else if (filterType === 'credits') matchesType = item.credit !== null;
      else if (filterType === 'fertilizer')
        matchesType = item.description.includes('DAP') || item.description.includes('Urea') || item.description.includes('SOP');
      else if (filterType === 'pesticides')
        matchesType = item.description.includes('Coragen') || item.description.includes('Match') || item.description.includes('Confidor');

      return matchesSearch && matchesType;
    });
  }, [searchQuery, filterType]);

  const handleExportCSV = () => {
    const headers = ['Date', 'Document Ref', 'Description', 'Quantity', 'Debit (+PKR)', 'Credit (-PKR)', 'Running Balance', 'Signed By'];
    const rows = LEDGER_DATA.map((e) => [
      e.date,
      e.docRef,
      `"${e.description}"`,
      e.qty,
      e.debit || '',
      e.credit || '',
      e.runningBalance,
      `"${e.signedBy}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `farmer_khata_FAR-042_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col w-full gap-space-lg">

      {/* Breadcrumb & Top Utility Row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-xs font-label-md text-label-md text-on-surface-variant">
          <button
            className="hover:text-primary transition-colors cursor-pointer"
            onClick={() => navigate('/customers')}
            type="button"
          >
            Customers
          </button>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">Farmer Khata</span>
          <span className="text-outline-variant">/</span>
          <span className="text-primary font-semibold">Statement of Account (Running Ledger)</span>
        </div>
        <div className="flex items-center gap-space-xs">
          <span className="inline-flex items-center gap-1.5 px-space-sm py-1 rounded-full bg-surface-container-high text-primary font-label-sm text-label-sm">
            <span className="material-symbols-outlined text-[16px] text-secondary">verified</span>
            Audit Certified Ledger
          </span>
          <span className="text-outline-variant">|</span>
          <span className="font-label-sm text-label-sm text-outline">Fiscal Year 2024-25</span>
        </div>
      </div>

      {/* Farmer Profile & Master Ledger Card */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg flex flex-col xl:flex-row items-start xl:items-center justify-between gap-space-lg">
        {/* Farmer Metadata Section */}
        <div className="flex items-start gap-space-md min-w-0">
          <div className="relative w-14 h-14 rounded-xl bg-surface-container-high flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-primary text-[32px]">agriculture</span>
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-secondary flex items-center justify-center text-on-secondary shadow-sm">
              <span className="material-symbols-outlined text-[10px]">check</span>
            </span>
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex flex-wrap items-center gap-space-xs">
              <h2 className="font-headline-md text-headline-md text-on-surface truncate">
                Chaudhry Riaz Ahmed
              </h2>
              <span className="font-label-sm text-label-sm px-space-xs py-0.5 rounded-full bg-surface-container-high text-primary font-mono font-semibold">
                #KHATA-FAR-042
              </span>
              <span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm">
                <span className="material-symbols-outlined text-[12px] text-tertiary">workspace_premium</span>
                VIP Grower
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-space-md gap-y-1 font-body-sm text-body-sm text-on-surface-variant mt-1">
              <span className="inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-outline text-[15px]">call</span>
                <span className="font-mono text-on-surface font-medium">+92 300 8712394</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-outline text-[15px]">location_on</span>
                <span>Chak 42-RB, Tehsil &amp; Distt. Faisalabad</span>
              </span>
              <span className="inline-flex items-center gap-1 text-outline">
                <span className="material-symbols-outlined text-outline text-[15px]">potted_plant</span>
                <span>Wheat &amp; Sugarcane • 65 Acres</span>
              </span>
            </div>
          </div>
        </div>

        {/* Center Standing Gauge & Status */}
        <div className="flex flex-col bg-surface-container-low px-space-md py-space-sm rounded-lg min-w-[260px] w-full xl:w-auto">
          <div className="flex items-center justify-between mb-1">
            <span className="font-label-sm text-label-sm text-secondary font-semibold inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-secondary"></span>
              Active • Good Standing
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">48% Limit Used</span>
          </div>
          {/* Mini Progress Meter */}
          <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden mb-1.5">
            <div className="bg-primary h-full rounded-full transition-all duration-500" style={{ width: '48%' }}></div>
          </div>
          <div className="flex items-center justify-between font-label-sm text-label-sm text-outline">
            <span>
              Sanctioned Limit: <strong className="text-on-surface font-mono">Rs. 300,000</strong>
            </span>
            <span>
              Available: <strong className="text-secondary font-mono">Rs. 155,000</strong>
            </span>
          </div>
        </div>

        {/* Action Toolbar Right */}
        <div className="flex flex-wrap items-center gap-space-xs w-full xl:w-auto justify-start xl:justify-end">
          <button
            className="h-[38px] px-space-sm rounded-lg bg-surface-container-low hover:bg-surface-container-high text-on-surface font-label-md text-label-md flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            onClick={handleExportCSV}
            title="Download PDF"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px] text-primary">picture_as_pdf</span>
            <span className="hidden sm:inline">PDF Statement</span>
          </button>
          <button
            className="h-[38px] px-space-sm rounded-lg bg-surface-container-low hover:bg-surface-container-high text-on-surface font-label-md text-label-md flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            onClick={() => window.print()}
            title="Print Slip (Ctrl+P)"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px] text-outline">print</span>
            <span className="hidden sm:inline">Print Slip</span>
          </button>
          <button
            className="h-[38px] px-space-sm rounded-lg bg-whatsapp/10 hover:bg-whatsapp/20 text-whatsapp-dark font-label-md text-label-md flex items-center gap-1.5 transition-colors cursor-pointer"
            onClick={() => showToast('Dispatched encrypted WhatsApp statement voucher to farmer mobile!')}
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">chat</span>
            <span className="hidden sm:inline">WhatsApp</span>
          </button>
          <button
            className="h-[38px] px-space-md rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            onClick={() => navigate('/payments')}
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">add_card</span>
            <span>+ Record Khata Payment</span>
          </button>
        </div>
      </div>

      {/* Financial Summary Ribbon (4 Bento Stat Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
        {/* Card 1: Opening Balance */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between text-outline mb-space-xs">
            <span className="font-label-sm text-label-sm uppercase tracking-wider">
              Opening Balance (Rabi 2024)
            </span>
            <span className="material-symbols-outlined text-[18px] text-outline">history</span>
          </div>
          <div>
            <div className="font-currency-stat text-currency-stat text-on-surface font-mono tracking-tight">
              Rs. 45,000
            </div>
            <p className="font-body-sm text-body-sm text-outline mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">calendar_today</span>
              B/F from 01 Sep 2024
            </p>
          </div>
          <div className="mt-3 pt-2 bg-surface-container-low -mx-space-md -mb-space-md px-space-md py-1.5 flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm">
            <span>Verified by Auditor</span>
            <span className="font-mono text-outline">#OB-2024-42</span>
          </div>
        </div>

        {/* Card 2: Total Sales / Debits */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between text-error mb-space-xs">
            <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold text-error">
              Total Debits (+ Issued)
            </span>
            <span className="material-symbols-outlined text-[18px] text-error">shopping_cart_checkout</span>
          </div>
          <div>
            <div className="font-currency-stat text-currency-stat text-error font-mono tracking-tight">
              +Rs. 245,000
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Chemicals, Seeds &amp; Fertilizer
            </p>
          </div>
          <div className="mt-3 pt-2 bg-error-container/40 -mx-space-md -mb-space-md px-space-md py-1.5 flex items-center justify-between text-on-error-container font-label-sm text-label-sm">
            <span>4 Active Invoices</span>
            <span className="font-mono">18 Pack Units</span>
          </div>
        </div>

        {/* Card 3: Total Credits Settled */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between text-secondary mb-space-xs">
            <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold text-secondary">
              Total Credits (- Paid)
            </span>
            <span className="material-symbols-outlined text-[18px] text-secondary">payments</span>
          </div>
          <div>
            <div className="font-currency-stat text-currency-stat text-secondary font-mono tracking-tight">
              -Rs. 145,000
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Cash &amp; Mobile Remittances</p>
          </div>
          <div className="mt-3 pt-2 bg-secondary-container/30 -mx-space-md -mb-space-md px-space-md py-1.5 flex items-center justify-between text-on-secondary-container font-label-sm text-label-sm">
            <span>2 Payment Receipts</span>
            <span className="font-mono">100% Cleared</span>
          </div>
        </div>

        {/* Card 4: Net Balance Due (Highlighted) */}
        <div className="bg-primary text-on-primary rounded-xl p-space-md shadow-md flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -right-4 -bottom-4 w-28 h-28 bg-white/5 rounded-full pointer-events-none"></div>
          <div className="flex items-center justify-between text-on-primary-container mb-space-xs">
            <span className="font-label-sm text-label-sm uppercase tracking-wider font-bold">
              Net Balance Payable
            </span>
            <span className="material-symbols-outlined text-[20px] text-secondary-fixed">
              account_balance_wallet
            </span>
          </div>
          <div>
            <div className="font-display text-display font-mono text-on-primary tracking-tight leading-none mt-1">
              Rs. 145,000
            </div>
            <p className="font-body-sm text-body-sm text-on-primary-container mt-1.5 flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px] text-tertiary-fixed-dim">event_upcoming</span>
              Maturity: Post-Wheat Harvest / 30 Oct 2024
            </p>
          </div>
          <div className="mt-3 pt-2 bg-primary-container -mx-space-md -mb-space-md px-space-md py-1.5 flex items-center justify-between text-on-primary-container font-label-sm text-label-sm">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary-fixed"></span>
              Within Credit Period
            </span>
            <span className="font-mono text-on-primary font-semibold">15 Days Left</span>
          </div>
        </div>
      </div>

      {/* Operational Ledger Toolbar & Sowing Cycle Filter */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-md flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-space-md">
        <div className="flex flex-wrap items-center gap-space-sm flex-1">
          {/* Date Range Selector */}
          <div className="flex items-center gap-space-xs bg-surface-container-low px-space-md py-2 rounded-lg font-label-md text-label-md text-on-surface">
            <span className="material-symbols-outlined text-primary text-[18px]">calendar_month</span>
            <span className="font-semibold text-primary">Rabi Sowing Cycle:</span>
            <span className="font-mono text-on-surface">01 Sep 2024 — 15 Oct 2024</span>
            <span className="material-symbols-outlined text-outline text-[16px] cursor-pointer">arrow_drop_down</span>
          </div>

          {/* Transaction Type Filter */}
          <div className="relative">
            <select
              className="h-[38px] pl-3 pr-8 rounded-lg bg-surface-container-low font-body-sm text-body-sm text-on-surface appearance-none focus:outline-none focus:bg-surface-container cursor-pointer font-medium"
              onChange={(e) => setFilterType(e.target.value)}
              value={filterType}
            >
              <option value="all">All Transactions (Purchases, Payments, Returns, Adjustments)</option>
              <option value="debits">Purchases Only (Debits)</option>
              <option value="credits">Receipts Only (Credits)</option>
              <option value="fertilizer">Fertilizer &amp; DAP Only</option>
              <option value="pesticides">Pesticides &amp; Insecticides Only</option>
            </select>
            <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-outline text-[18px] pointer-events-none">
              expand_more
            </span>
          </div>

          {/* Quick Search inside Ledger */}
          <div className="relative flex-1 min-w-[200px]">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-outline text-[18px]">search</span>
            <input
              className="h-[38px] w-full pl-9 pr-3 rounded-lg bg-surface-container-low font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search bill #, brand (Coragen, DAP, Sona)..."
              type="text"
              value={searchQuery}
            />
          </div>
        </div>

        {/* Quick Export Actions */}
        <div className="flex items-center gap-space-xs shrink-0 self-end lg:self-auto">
          <button
            className="h-[38px] px-space-sm rounded-lg bg-surface-container-low hover:bg-surface-container-high text-on-surface font-label-md text-label-md flex items-center gap-1.5 transition-colors cursor-pointer"
            onClick={handleExportCSV}
            type="button"
          >
            <span className="material-symbols-outlined text-secondary text-[18px]">table_view</span>
            <span>Export Excel (CSV)</span>
          </button>
          <button
            className="h-[38px] px-space-sm rounded-lg bg-surface-container-low hover:bg-surface-container-high text-on-surface font-label-md text-label-md flex items-center gap-1.5 transition-colors cursor-pointer"
            onClick={() => showToast('Switching to detailed Ledger Audit Trail view...')}
            type="button"
          >
            <span className="material-symbols-outlined text-primary text-[18px]">tune</span>
            <span>View Options</span>
          </button>
        </div>
      </div>

      {/* Master Farmer Running Ledger Table */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
        {/* Table Header Info Bar */}
        <div className="px-space-lg py-space-sm bg-surface-container-low flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-xs">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-primary text-[20px]">account_balance</span>
            <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
              Running Statement of Account
            </span>
            <span className="px-2 py-0.5 rounded-full bg-surface-container-high font-mono font-label-sm text-label-sm text-primary">
              {filteredEntries.length} Entries
            </span>
          </div>
          <div className="flex items-center gap-space-md font-label-sm text-label-sm text-outline">
            <span>Dual Column Debit/Credit System</span>
            <span>•</span>
            <span className="font-mono text-on-surface font-medium">All figures in Pakistani Rupee (PKR)</span>
          </div>
        </div>

        {/* Responsive Table Container */}
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low font-label-sm text-label-sm text-outline uppercase tracking-wider">
                <th className="py-3 px-space-md">Date</th>
                <th className="py-3 px-space-md">Doc Ref #</th>
                <th className="py-3 px-space-lg min-w-[280px]">Description &amp; Agricultural Formulation</th>
                <th className="py-3 px-space-md text-center">Qty / Pack</th>
                <th className="py-3 px-space-md text-right text-error font-semibold">Debit (+ Purchase)</th>
                <th className="py-3 px-space-md text-right text-secondary font-semibold">Credit (- Payment)</th>
                <th className="py-3 px-space-lg text-right text-on-surface font-bold">Running Balance</th>
                <th className="py-3 px-space-md text-right">Signed By</th>
              </tr>
            </thead>
            <tbody className="font-body-md text-body-md divide-y divide-surface-container-low">
              {filteredEntries.map((row) => (
                <tr
                  className={`${
                    row.docType === 'OB'
                      ? 'bg-surface-container-lowest'
                      : row.docType === 'RCP'
                      ? 'bg-success-soft/20'
                      : 'bg-surface-container-low/30'
                  } hover:bg-surface-container-low transition-colors`}
                  key={row.id}
                >
                  <td className="py-3.5 px-space-md font-mono text-on-surface font-medium whitespace-nowrap">
                    {row.date}
                  </td>
                  <td className="py-3.5 px-space-md whitespace-nowrap">
                    {row.docType === 'OB' ? (
                      <span className="inline-flex items-center gap-1 font-mono font-label-sm text-label-sm px-2 py-0.5 rounded bg-surface-container text-on-surface-variant">
                        {row.docRef}
                      </span>
                    ) : row.docType === 'RCP' ? (
                      <span className="inline-flex items-center gap-1 font-mono font-label-sm text-label-sm px-2 py-0.5 rounded bg-success-soft text-success font-semibold">
                        <span className="material-symbols-outlined text-[13px]">task_alt</span>
                        {row.docRef}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-mono font-label-sm text-label-sm px-2 py-0.5 rounded bg-surface-container-high text-primary font-semibold">
                        <span className="material-symbols-outlined text-[13px]">receipt_long</span>
                        {row.docRef}
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-space-lg">
                    <div className="flex flex-col">
                      <span className={`font-semibold ${row.docType === 'RCP' ? 'text-secondary flex items-center gap-1.5' : 'text-on-surface'}`}>
                        {row.docType === 'RCP' && (
                          <span className="material-symbols-outlined text-[16px]">price_check</span>
                        )}
                        {row.description}
                      </span>
                      {row.subDescription && (
                        <span className="font-body-sm text-body-sm text-on-surface-variant">
                          {row.subDescription}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-space-md text-center font-mono font-medium text-on-surface">
                    {row.qty}
                  </td>
                  <td className="py-3.5 px-space-md text-right font-currency-cell text-currency-cell font-mono font-bold text-error whitespace-nowrap">
                    {row.debit ? `+Rs. ${row.debit.toLocaleString()}` : '—'}
                  </td>
                  <td className="py-3.5 px-space-md text-right font-currency-cell text-currency-cell font-mono font-bold text-secondary whitespace-nowrap">
                    {row.credit ? `-Rs. ${row.credit.toLocaleString()}` : '—'}
                  </td>
                  <td className="py-3.5 px-space-lg text-right font-currency-cell text-currency-cell font-mono font-bold text-on-surface whitespace-nowrap">
                    Rs. {row.runningBalance.toLocaleString()}
                  </td>
                  <td className="py-3.5 px-space-md text-right whitespace-nowrap">
                    {row.isSystem ? (
                      <span className="inline-flex items-center gap-1 font-label-sm text-label-sm text-outline">
                        <span className="material-symbols-outlined text-[14px]">smart_toy</span>
                        System Auto
                      </span>
                    ) : (
                      <div>
                        <span className="font-label-sm text-label-sm text-on-surface font-medium block">
                          {row.signedBy}
                        </span>
                        <span className="block font-label-sm text-label-sm text-outline">{row.role}</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Ledger Totals & Sub-Summary Footer */}
        <div className="bg-surface-container-high px-space-lg py-space-md flex flex-col md:flex-row items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-md font-label-md text-label-md">
            <span className="text-on-surface-variant font-medium">Cycle Summary Totals:</span>
            <span className="inline-flex items-center gap-1 text-error font-mono font-bold">
              <span>Debits (+):</span> +Rs. 245,000
            </span>
            <span className="text-outline-variant">|</span>
            <span className="inline-flex items-center gap-1 text-secondary font-mono font-bold">
              <span>Credits (-):</span> -Rs. 145,000
            </span>
          </div>
          <div className="flex items-center gap-space-sm">
            <span className="font-label-lg text-label-lg text-on-surface">Current Closing Outstanding:</span>
            <span className="font-currency-stat text-currency-stat font-mono font-bold text-primary">
              Rs. 145,000
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Details & Verification Dual Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md">
        {/* Left Column: Agricultural Regulatory & Khata Compliance Notes (7 Cols) */}
        <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl shadow-sm p-space-lg flex flex-col justify-between">
          <div className="flex flex-col gap-space-xs">
            <div className="flex items-center gap-space-xs text-primary font-headline-sm text-headline-sm">
              <span className="material-symbols-outlined text-[20px]">gavel</span>
              <span>Khata Terms, Regulatory Compliance &amp; Verification</span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
              Certified ledger statement issued by <strong>Pesticide Club ERP</strong> as of 15 Oct 2024. All pesticide, weedicide, and subsidized chemical supplies conform to statutory Punjab Agricultural Department regulations and Anti-Adulteration Ordinance standards.
            </p>
            {/* Urdu Legal Snippet for Farmer Trust */}
            <div className="bg-surface-container-low rounded-lg p-space-sm mt-1">
              <p className="font-body-sm text-body-sm text-on-surface font-semibold text-right leading-relaxed" dir="rtl">
                تصدیق شدہ کھاتہ ریڈنگ۔ تمام ادویات اور کھادیں پنجاب زرعی محکمہ کے نافذ کردہ ضوابط اور معیارات کے مطابق فراہم کی گئی ہیں۔ فصل کی کٹائی کے بعد ادائیگی واجب الادا ہے۔
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm mt-2 text-outline font-label-sm text-label-sm">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-secondary text-[16px]">check_circle</span>
                <span>Interest-Free Agri Murabaha / Musawamah Credit</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-secondary text-[16px]">check_circle</span>
                <span>Batch Expiry &amp; Formulation Lab Guaranteed</span>
              </div>
            </div>
          </div>
          <div className="mt-space-md pt-space-sm border-t border-surface-container flex items-center justify-between text-outline font-label-sm text-label-sm">
            <span>
              Khata Book Reg: <strong>#PB-FSD-9982</strong>
            </span>
            <span>Generated: 15-Oct-2024, 04:32 PM (PKT)</span>
          </div>
        </div>

        {/* Right Column: Dual Signature & Stamp Block (5 Cols) */}
        <div className="lg:col-span-5 bg-surface-container-lowest rounded-xl shadow-sm p-space-lg flex flex-col justify-between">
          <div className="flex items-center justify-between mb-space-sm">
            <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">Dual Endorsement</span>
            <span className="material-symbols-outlined text-outline text-[20px]">history_edu</span>
          </div>
          <div className="grid grid-cols-2 gap-space-md py-space-sm">
            {/* Farmer Signature Box */}
            <div className="flex flex-col items-center justify-end bg-surface-container-low rounded-lg p-space-sm min-h-[120px] text-center">
              <div className="w-16 h-12 flex items-center justify-center text-outline-variant mb-1">
                <span className="material-symbols-outlined text-[36px] opacity-40">fingerprint</span>
              </div>
              <div className="w-full h-px bg-outline-variant/60 mb-1.5"></div>
              <span className="font-label-sm text-label-sm text-on-surface font-semibold">
                Chaudhry Riaz Ahmed
              </span>
              <span className="font-label-sm text-label-sm text-outline">Farmer Signature / Thumb</span>
            </div>
            {/* Shop Manager Stamp & Signature */}
            <div className="flex flex-col items-center justify-end bg-surface-container-low rounded-lg p-space-sm min-h-[120px] text-center relative overflow-hidden">
              <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono text-[9px] font-bold uppercase tracking-wider">
                STAMPED
              </div>
              <div className="w-16 h-12 flex items-center justify-center text-primary mb-1">
                <span className="material-symbols-outlined text-[32px] text-primary/70">draw</span>
              </div>
              <div className="w-full h-px bg-outline-variant/60 mb-1.5"></div>
              <span className="font-label-sm text-label-sm text-primary font-semibold">Muhammad Khan</span>
              <span className="font-label-sm text-label-sm text-outline">Shop Manager / Authorizer</span>
            </div>
          </div>
          <div className="mt-space-xs text-center font-label-sm text-label-sm text-outline">
            Both parties agree to reconcile balances per stated terms upon crop liquidation.
          </div>
        </div>
      </div>
    </div>
  );
};

export default KhataPage;
