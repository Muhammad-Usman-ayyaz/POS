import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { notify } from '@/lib/notify';

interface SaleRecord {
  id: string;
  saleNo: string;
  customer: string;
  village: string;
  date: string;
  time: string;
  items: string;
  itemCount: string;
  total: number;
  paid: number;
  remaining: number;
  channel: string;
  channelType: 'cash' | 'khata' | 'jazzcash' | 'split' | 'bank';
  status: 'Settled' | 'Khata Charged' | 'Partial Due';
}

const SALES_DATA: SaleRecord[] = [
  {
    id: 'sale-1',
    saleNo: 'SL-2024-1092',
    customer: 'Chaudhry Riaz Ahmed',
    village: 'Chak 42-RB, Sargodha Road',
    date: '15 Oct 2024',
    time: '04:45 PM',
    items: '4x Zorawar DAP, 2x Confidor 200SL',
    itemCount: '3 items total • Batch #ZOR-99',
    total: 64800,
    paid: 64800,
    remaining: 0,
    channel: 'Cash Counter',
    channelType: 'cash',
    status: 'Settled',
  },
  {
    id: 'sale-2',
    saleNo: 'SL-2024-1091',
    customer: 'Malik Tariq Mehmood',
    village: 'Kot Momin • Acct #F-104',
    date: '15 Oct 2024',
    time: '04:12 PM',
    items: '6x Coragen 20 SC, 1x Match 050 EC',
    itemCount: 'FMC Specialty Chem',
    total: 24000,
    paid: 0,
    remaining: 24000,
    channel: 'On Khata (Credit)',
    channelType: 'khata',
    status: 'Khata Charged',
  },
  {
    id: 'sale-3',
    saleNo: 'SL-2024-1090',
    customer: 'Haji Munir Akhtar',
    village: 'Deowal • Registered Retailer',
    date: '15 Oct 2024',
    time: '03:30 PM',
    items: '10x Sona Urea (FFC)',
    itemCount: 'Direct Dispatch Lot',
    total: 46500,
    paid: 46500,
    remaining: 0,
    channel: 'JazzCash #8821',
    channelType: 'jazzcash',
    status: 'Settled',
  },
  {
    id: 'sale-4',
    saleNo: 'SL-2024-1089',
    customer: 'Ghulam Abbas Bhatti',
    village: 'Lallian • Tenant Farmer',
    date: '15 Oct 2024',
    time: '02:15 PM',
    items: '2x Belt Expert, 1x Karate 2.5 EC',
    itemCount: 'Cotton Bollworm Pack',
    total: 11200,
    paid: 5000,
    remaining: 6200,
    channel: 'Split: Cash + Khata',
    channelType: 'split',
    status: 'Partial Due',
  },
  {
    id: 'sale-5',
    saleNo: 'SL-2024-1088',
    customer: 'Walk-in Cash Farmer',
    village: 'General Customer Counter #01',
    date: '15 Oct 2024',
    time: '01:45 PM',
    items: '1x Solubor Boron 20%, 2x Zinc Sulfate',
    itemCount: 'Micronutrient Mix',
    total: 8750,
    paid: 8750,
    remaining: 0,
    channel: 'Cash Counter',
    channelType: 'cash',
    status: 'Settled',
  },
  {
    id: 'sale-6',
    saleNo: 'SL-2024-1087',
    customer: 'Ch. Sarfraz Virk',
    village: 'Virk Farm Estate • Mandi Road',
    date: '15 Oct 2024',
    time: '11:15 AM',
    items: '25x Engro DAP Fertilizer',
    itemCount: 'Commercial Wholesale',
    total: 331000,
    paid: 331000,
    remaining: 0,
    channel: 'HBL Raast Trx',
    channelType: 'bank',
    status: 'Settled',
  },
];

export const SalesPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [channelFilter, setChannelFilter] = useState('all');
  const [quickFilter, setQuickFilter] = useState<'all' | 'khata' | 'over50k' | 'partial'>('all');

  const showToast = (msg: string) => notify(msg);

  const filteredSales = useMemo(() => {
    return SALES_DATA.filter((s) => {
      const matchSearch =
        s.saleNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.items.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.village.toLowerCase().includes(searchTerm.toLowerCase());

      const matchChannel = channelFilter === 'all' || s.channel.toLowerCase().includes(channelFilter.toLowerCase());

      let matchQuick = true;
      if (quickFilter === 'khata') matchQuick = s.channelType === 'khata' || s.channelType === 'split';
      if (quickFilter === 'over50k') matchQuick = s.total >= 50000;
      if (quickFilter === 'partial') matchQuick = s.remaining > 0;

      return matchSearch && matchChannel && matchQuick;
    });
  }, [searchTerm, channelFilter, quickFilter]);

  const handleExportCsv = () => {
    const headers = ['Sale #', 'Customer', 'Village', 'Date', 'Time', 'Items', 'Total (PKR)', 'Paid (PKR)', 'Remaining (PKR)', 'Channel', 'Status'];
    const rows = filteredSales.map((s) => [
      `"${s.saleNo}"`,
      `"${s.customer}"`,
      `"${s.village}"`,
      `"${s.date}"`,
      `"${s.time}"`,
      `"${s.items}"`,
      `"${s.total}"`,
      `"${s.paid}"`,
      `"${s.remaining}"`,
      `"${s.channel}"`,
      `"${s.status}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `sales_register_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Sales Register CSV exported successfully!');
  };

  return (
    <div className="flex flex-col w-full gap-y-space-xl">

      {/* Top Action Breadcrumb & Title Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-space-md">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-space-xs font-label-sm text-label-sm text-outline">
            <span>Sales &amp; Orders</span>
            <span className="text-outline-variant">/</span>
            <span className="text-primary font-semibold">Sales History</span>
          </div>
          <div className="flex items-center gap-space-md mt-1">
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
              Sales History &amp; POS Register
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container-high text-primary font-label-sm text-label-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
              Live Register Active
            </span>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
            Review completed counter sales, khata credit slips, payment distribution, and cashier settlement logs.
          </p>
        </div>

        {/* Action Cluster */}
        <div className="flex flex-wrap items-center gap-space-sm shrink-0">
          <button
            onClick={handleExportCsv}
            className="h-10 px-space-md rounded-xl bg-surface-container-lowest shadow-sm hover:bg-surface-container-low transition-colors font-label-md text-label-md text-on-surface flex items-center gap-2"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px] text-outline">file_download</span>
            <span>Export CSV</span>
          </button>
          <div className="relative inline-flex items-center">
            <button
              className="h-10 px-space-md rounded-xl bg-surface-container-lowest shadow-sm hover:bg-surface-container-low transition-colors font-label-md text-label-md text-on-surface flex items-center gap-2.5"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px] text-primary">calendar_today</span>
              <span>Today (15 Oct 2024)</span>
            </button>
          </div>
          <Link
            to="/pos"
            className="h-10 px-space-lg rounded-xl bg-primary text-on-primary font-label-md text-label-md flex items-center gap-2 shadow-sm hover:bg-primary-container transition-all font-semibold"
          >
            <span className="material-symbols-outlined text-[20px]">point_of_sale</span>
            <span>+ New POS Sale</span>
          </Link>
        </div>
      </div>

      {/* 4 KPI Summary Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-gutter-lg">
        {/* KPI 1: Today's Total Sales */}
        <div className="relative overflow-hidden bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between group hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Today's Total Sales</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-currency-stat text-currency-stat text-on-surface font-bold">Rs. 486,250</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-primary shrink-0">
              <span className="material-symbols-outlined text-[22px]">payments</span>
            </div>
          </div>
          <div className="mt-4 pt-3 flex items-center justify-between font-label-sm text-label-sm">
            <div className="inline-flex items-center gap-1 text-secondary font-semibold">
              <span className="material-symbols-outlined text-[16px]">trending_up</span>
              <span>+14.2%</span>
              <span className="text-outline font-normal">vs yesterday</span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-medium">38 Sales</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary"></div>
        </div>

        {/* KPI 2: Cash Realized */}
        <div className="relative overflow-hidden bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between group hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Cash Realized (Counter)</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-currency-stat text-currency-stat text-secondary font-bold">Rs. 215,500</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-secondary shrink-0">
              <span className="material-symbols-outlined text-[22px]">account_balance_wallet</span>
            </div>
          </div>
          <div className="mt-4 pt-3 flex items-center justify-between font-label-sm text-label-sm">
            <div className="flex items-center gap-1.5 text-on-surface-variant">
              <span className="font-semibold text-secondary">44.3%</span>
              <span>of counter turnover</span>
            </div>
            <span className="font-label-sm text-label-sm text-outline">Vault Drawer #1</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-secondary"></div>
        </div>

        {/* KPI 3: Added to Farmer Khata */}
        <div className="relative overflow-hidden bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between group hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Added to Farmer Khata (Credit)</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-currency-stat text-currency-stat text-tertiary font-bold">Rs. 210,750</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-tertiary-fixed flex items-center justify-center text-on-tertiary-fixed shrink-0">
              <span className="material-symbols-outlined text-[22px]">menu_book</span>
            </div>
          </div>
          <div className="mt-4 pt-3 flex items-center justify-between font-label-sm text-label-sm">
            <div className="inline-flex items-center gap-1 text-on-tertiary-fixed-variant font-medium">
              <span className="material-symbols-outlined text-[16px]">history_edu</span>
              <span>18 farmers billed</span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-semibold">Credit Ledgers</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-tertiary"></div>
        </div>

        {/* KPI 4: Digital & Bank Remittances */}
        <div className="relative overflow-hidden bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between group hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Digital &amp; Bank Remittance</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-currency-stat text-currency-stat text-primary font-bold">Rs. 60,000</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary-fixed flex items-center justify-center text-primary shrink-0">
              <span className="material-symbols-outlined text-[22px]">contactless</span>
            </div>
          </div>
          <div className="mt-4 pt-3 flex items-center justify-between font-label-sm text-label-sm">
            <div className="flex items-center gap-1.5 text-on-surface-variant truncate">
              <span className="w-2 h-2 rounded-full bg-primary"></span>
              <span className="truncate">JazzCash • Easypaisa • HBL</span>
            </div>
            <span className="font-semibold text-primary font-label-sm text-label-sm">6 Trx</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary"></div>
        </div>
      </div>

      {/* Search & Multi-Filter Control Console */}
      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-md">
        {/* Primary Search and Filter Row */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-space-sm items-center">
          {/* Search Field */}
          <div className="md:col-span-5 relative flex items-center">
            <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px]">search</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search sale receipt #, farmer name, CNIC, product formulation..."
              className="w-full h-10 pl-10 pr-4 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest transition-colors shadow-inner"
            />
          </div>

          {/* Filter: Payment Channel */}
          <div className="md:col-span-3 relative">
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="w-full h-10 px-3 pr-8 rounded-xl bg-surface-container-low text-on-surface font-label-md text-label-md focus:outline-none appearance-none cursor-pointer"
            >
              <option value="all">All Payment Methods</option>
              <option value="cash">Cash (Counter)</option>
              <option value="khata">On Khata (Credit)</option>
              <option value="jazzcash">JazzCash</option>
              <option value="hbl">HBL / Bank Remittance</option>
            </select>
            <span className="material-symbols-outlined absolute right-2.5 top-2.5 pointer-events-none text-outline text-[18px]">
              expand_more
            </span>
          </div>

          {/* Filter: Crop Season */}
          <div className="md:col-span-3 relative">
            <select className="w-full h-10 px-3 pr-8 rounded-xl bg-surface-container-low text-on-surface font-label-md text-label-md focus:outline-none appearance-none cursor-pointer">
              <option>Rabi Season 2024-25</option>
              <option>Kharif Season 2024</option>
              <option>All Fiscal Seasons</option>
            </select>
            <span className="material-symbols-outlined absolute right-2.5 top-2.5 pointer-events-none text-outline text-[18px]">
              expand_more
            </span>
          </div>

          {/* Reset Button */}
          <div className="md:col-span-1 flex justify-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setChannelFilter('all');
                setQuickFilter('all');
              }}
              title="Reset Filters"
              className="w-full h-10 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface-variant flex items-center justify-center transition-colors"
              type="button"
            >
              <span className="material-symbols-outlined text-[20px]">restart_alt</span>
            </button>
          </div>
        </div>

        {/* Quick Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-space-sm pt-2 border-t border-surface-container">
          <div className="flex flex-wrap items-center gap-1.5 font-label-sm text-label-sm">
            <span className="text-outline mr-1">Quick Select:</span>
            <button
              type="button"
              onClick={() => setQuickFilter('all')}
              className={`px-3 py-1 rounded-full font-semibold transition-all ${
                quickFilter === 'all'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
              }`}
            >
              All Today's Sales ({SALES_DATA.length})
            </button>
            <button
              type="button"
              onClick={() => setQuickFilter('khata')}
              className={`px-3 py-1 rounded-full font-medium transition-all ${
                quickFilter === 'khata'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
              }`}
            >
              Credit / Khata Sales Only
            </button>
            <button
              type="button"
              onClick={() => setQuickFilter('over50k')}
              className={`px-3 py-1 rounded-full font-medium transition-all ${
                quickFilter === 'over50k'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
              }`}
            >
              Over Rs. 50,000
            </button>
            <button
              type="button"
              onClick={() => setQuickFilter('partial')}
              className={`px-3 py-1 rounded-full font-medium transition-all ${
                quickFilter === 'partial'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
              }`}
            >
              Partial Balances Due
            </button>
          </div>
          <span className="text-outline font-label-sm text-label-sm">
            Showing <strong>{filteredSales.length}</strong> of 38 Records
          </span>
        </div>
      </div>

      {/* Comprehensive Sales History Table Card */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-surface-container overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1100px]">
            <thead>
              <tr className="bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">
                <th className="py-3 px-4 font-semibold">Sale #</th>
                <th className="py-3 px-4 font-semibold">Customer / Farmer</th>
                <th className="py-3 px-4 font-semibold">Date &amp; Time</th>
                <th className="py-3 px-4 font-semibold">Items &amp; Formulations</th>
                <th className="py-3 px-4 font-semibold text-right">Total Amount</th>
                <th className="py-3 px-4 font-semibold text-right">Paid Amount</th>
                <th className="py-3 px-4 font-semibold text-right">Remaining Balance</th>
                <th className="py-3 px-4 font-semibold">Channel</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="font-body-md text-body-md text-on-surface divide-y divide-surface-container-low">
              {filteredSales.map((sale) => (
                <tr key={sale.id} className="hover:bg-surface-container-low/60 transition-colors group">
                  <td className="py-3.5 px-4 font-semibold text-primary font-mono whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-outline text-[16px]">receipt_long</span>
                      <span>#{sale.saleNo}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex flex-col min-w-0">
                      <span className="font-label-md text-label-md text-on-surface font-semibold truncate">
                        {sale.customer}
                      </span>
                      <div className="flex items-center gap-1 font-label-sm text-label-sm text-outline truncate">
                        <span className="material-symbols-outlined text-[12px]">location_on</span>
                        <span>{sale.village}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="font-label-md text-label-md font-medium">{sale.date}</span>
                      <span className="font-body-sm text-body-sm text-outline">{sale.time}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex flex-col max-w-[220px]">
                      <span className="font-body-sm text-body-sm text-on-surface truncate">{sale.items}</span>
                      <span className="font-label-sm text-label-sm text-outline">{sale.itemCount}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-right font-currency-cell text-currency-cell text-on-surface whitespace-nowrap font-bold">
                    Rs. {sale.total.toLocaleString()}
                  </td>
                  <td className="py-3.5 px-4 text-right font-currency-cell text-currency-cell text-secondary whitespace-nowrap font-bold">
                    Rs. {sale.paid.toLocaleString()}
                  </td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    {sale.remaining === 0 ? (
                      <span className="inline-flex items-center gap-1 font-label-sm text-label-sm text-secondary font-semibold">
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        <span>Rs. 0 (Nil)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-label-sm text-label-sm text-error font-semibold font-currency-cell">
                        <span className="material-symbols-outlined text-[14px]">pending</span>
                        <span>Rs. {sale.remaining.toLocaleString()} Due</span>
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container font-label-sm text-label-sm font-semibold text-primary">
                      {sale.channel}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full font-label-sm text-label-sm font-semibold ${
                        sale.status === 'Settled'
                          ? 'bg-success-soft text-success'
                          : sale.status === 'Khata Charged'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-error-container text-error'
                      }`}
                    >
                      {sale.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1 text-on-surface-variant">
                      <Link
                        to="/invoices"
                        className="p-1.5 rounded-lg hover:bg-surface-container hover:text-primary transition-colors"
                        title="View Commercial Invoice"
                      >
                        <span className="material-symbols-outlined text-[18px]">visibility</span>
                      </Link>
                      <button
                        onClick={() => showToast(`Thermal print slip queued for #${sale.saleNo}!`)}
                        className="p-1.5 rounded-lg hover:bg-surface-container hover:text-primary transition-colors"
                        title="Print 80mm Thermal Receipt"
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[18px]">print</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Table Footer Pagination */}
        <div className="bg-surface-container-low px-space-md py-3 flex flex-col sm:flex-row items-center justify-between gap-space-sm border-t border-surface-container">
          <span className="font-body-sm text-body-sm text-outline">
            Showing 1 to {filteredSales.length} of 38 sales entries today
          </span>
          <div className="flex items-center gap-1">
            <button disabled className="w-8 h-8 rounded-lg bg-surface-container-lowest text-outline flex items-center justify-center disabled:opacity-40">
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
            <button className="w-8 h-8 rounded-lg bg-primary text-on-primary font-label-sm text-label-sm font-semibold flex items-center justify-center">
              1
            </button>
            <button className="w-8 h-8 rounded-lg bg-surface-container-lowest text-on-surface font-label-sm text-label-sm flex items-center justify-center">
              2
            </button>
            <button className="w-8 h-8 rounded-lg bg-surface-container-lowest text-on-surface flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Analytical Split: Velocity & Category Contribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-lg">
        {/* Card Left: Hourly Sales Velocity */}
        <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl p-space-lg shadow-sm border border-surface-container flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">timelapse</span>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    Hourly Counter Sales Velocity
                  </h2>
                </div>
                <p className="font-body-sm text-body-sm text-outline mt-0.5">
                  Counter rush patterns: 10:00 AM mandi influx &amp; 04:00 PM field return
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-secondary/10 text-secondary font-label-sm text-label-sm font-semibold">
                Peak: 04:00 PM (11 Trx)
              </span>
            </div>

            {/* Inline SVG Distribution Chart */}
            <div className="mt-6 flex flex-col gap-2">
              <div className="h-44 w-full">
                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 540 140">
                  <line stroke="var(--erp-surface-container-high)" strokeDasharray="3 3" strokeWidth="1" x1="0" x2="540" y1="20" y2="20"></line>
                  <line stroke="var(--erp-surface-container-high)" strokeDasharray="3 3" strokeWidth="1" x1="0" x2="540" y1="60" y2="60"></line>
                  <line stroke="var(--erp-surface-container-high)" strokeDasharray="3 3" strokeWidth="1" x1="0" x2="540" y1="100" y2="100"></line>
                  <defs>
                    <linearGradient id="velocityFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#147A5F" stopOpacity="0.25"></stop>
                      <stop offset="100%" stopColor="#147A5F" stopOpacity="0.0"></stop>
                    </linearGradient>
                  </defs>
                  <path
                    d="M 0,120 Q 50,110 80,85 T 160,40 T 240,95 T 320,80 T 400,25 T 480,75 L 540,110 L 540,135 L 0,135 Z"
                    fill="url(#velocityFill)"
                  ></path>
                  <path
                    d="M 0,120 Q 50,110 80,85 T 160,40 T 240,95 T 320,80 T 400,25 T 480,75 L 540,110"
                    fill="none"
                    stroke="#147A5F"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                  ></path>
                  <circle cx="160" cy="40" fill="#147A5F" r="5" stroke="var(--erp-surface-container-lowest)" strokeWidth="2"></circle>
                  <text fill="#147A5F" fontSize="10" fontWeight="600" textAnchor="middle" x="160" y="30">
                    Rs. 112k
                  </text>
                  <circle cx="400" cy="25" fill="var(--erp-primary-container)" r="5" stroke="var(--erp-surface-container-lowest)" strokeWidth="2"></circle>
                  <text fill="var(--erp-primary-container)" fontSize="10" fontWeight="600" textAnchor="middle" x="400" y="16">
                    Rs. 168k
                  </text>
                </svg>
              </div>
              <div className="flex items-center justify-between text-outline font-label-sm text-label-sm pt-2">
                <span>08:00 AM</span>
                <span>10:00 AM (Mandi Opening)</span>
                <span>01:00 PM (Zuhr Break)</span>
                <span className="text-on-surface font-semibold">04:00 PM (Field Return)</span>
                <span>07:00 PM</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 flex items-center justify-between bg-surface-container-low rounded-xl px-space-md py-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[18px]">verified</span>
              <span className="font-label-md text-label-md text-on-surface">Average Basket Size Today</span>
            </div>
            <span className="font-currency-cell text-currency-cell text-primary font-bold">
              Rs. 12,796 / farmer bill
            </span>
          </div>
        </div>

        {/* Card Right: Category Revenue Contribution Today */}
        <div className="lg:col-span-5 bg-surface-container-lowest rounded-xl p-space-lg shadow-sm border border-surface-container flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary text-[20px]">pie_chart</span>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">Category Revenue Mix</h2>
                </div>
                <p className="font-body-sm text-body-sm text-outline mt-0.5">
                  Turnover distribution by product classification
                </p>
              </div>
              <span className="font-label-sm text-label-sm text-outline">Rabi Season</span>
            </div>

            <div className="mt-5 flex flex-col gap-space-md">
              {/* Fertilizer */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between font-label-md text-label-md">
                  <span className="text-on-surface font-semibold flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-primary"></span>
                    Fertilizers (DAP, Urea, Potash)
                  </span>
                  <span className="font-currency-cell text-currency-cell text-on-surface">Rs. 233,400 (48%)</span>
                </div>
                <div className="w-full h-2 rounded-full bg-surface-container overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: '48%' }}></div>
                </div>
              </div>

              {/* Insecticides */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between font-label-md text-label-md">
                  <span className="text-on-surface font-semibold flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-secondary"></span>
                    Insecticides &amp; Systemic
                  </span>
                  <span className="font-currency-cell text-currency-cell text-on-surface">Rs. 155,600 (32%)</span>
                </div>
                <div className="w-full h-2 rounded-full bg-surface-container overflow-hidden">
                  <div className="h-full bg-secondary rounded-full" style={{ width: '32%' }}></div>
                </div>
              </div>

              {/* Weedicides / Herbicides */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between font-label-md text-label-md">
                  <span className="text-on-surface font-semibold flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-tertiary"></span>
                    Weedicides &amp; Herbicides
                  </span>
                  <span className="font-currency-cell text-currency-cell text-on-surface">Rs. 68,075 (14%)</span>
                </div>
                <div className="w-full h-2 rounded-full bg-surface-container overflow-hidden">
                  <div className="h-full bg-tertiary rounded-full" style={{ width: '14%' }}></div>
                </div>
              </div>

              {/* Certified Seeds */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between font-label-md text-label-md">
                  <span className="text-on-surface font-semibold flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-primary-container"></span>
                    Certified Wheat &amp; Fodder Seeds
                  </span>
                  <span className="font-currency-cell text-currency-cell text-on-surface">Rs. 29,175 (6%)</span>
                </div>
                <div className="w-full h-2 rounded-full bg-surface-container overflow-hidden">
                  <div className="h-full bg-primary-container rounded-full" style={{ width: '6%' }}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 flex items-center justify-between font-label-sm text-label-sm text-outline border-t border-surface-container">
            <span>Active Warehouse Stock Synced</span>
            <Link to="/reports" className="text-primary font-semibold hover:underline flex items-center gap-0.5">
              <span>View Full Sales Report</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesPage;
