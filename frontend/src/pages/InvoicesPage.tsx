import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';

interface Invoice {
  id: string;
  invoiceNo: string;
  terminal: string;
  customer: string;
  cnic: string;
  details: string;
  date: string;
  dueDate: string;
  taxScheme: string;
  total: number;
  paid: number;
  remaining: number;
  status: 'Paid' | 'Khata Linked' | 'Partial' | 'Overdue';
}

const INVOICES_DATA: Invoice[] = [
  {
    id: 'inv-1',
    invoiceNo: 'INV-2024-892',
    terminal: 'POS Terminal #2',
    customer: 'Chaudhry Riaz Ahmed',
    cnic: '33100-8492019-3',
    details: 'Chak 44/GB',
    date: '12 Oct 2024',
    dueDate: '30 Oct 2024',
    taxScheme: 'Agri Exempt (0% GST)',
    total: 46700,
    paid: 46700,
    remaining: 0,
    status: 'Paid',
  },
  {
    id: 'inv-2',
    invoiceNo: 'INV-2024-891',
    terminal: 'Kisan Subsidy Desk',
    customer: 'Babar Sultan Kahlon',
    cnic: '33102-1849204-1',
    details: '50 Acres Cotton',
    date: '11 Oct 2024',
    dueDate: '25 Oct 2024',
    taxScheme: 'Punjab Seed Subsidy Approved',
    total: 104600,
    paid: 0,
    remaining: 104600,
    status: 'Khata Linked',
  },
  {
    id: 'inv-3',
    invoiceNo: 'INV-2024-890',
    terminal: 'B2B Wholesale Portal',
    customer: 'Green Agro Farms Ltd (Corporate)',
    cnic: 'NTN: 8192003-4',
    details: 'STRN Registered',
    date: '10 Oct 2024',
    dueDate: '24 Oct 2024',
    taxScheme: 'Standard 18% Tax',
    total: 210000,
    paid: 100000,
    remaining: 110000,
    status: 'Partial',
  },
  {
    id: 'inv-4',
    invoiceNo: 'INV-2024-889',
    terminal: 'Direct Dispatch',
    customer: 'Mahr Tariq Jatoi',
    cnic: '32304-9912044-7',
    details: 'Orchard Tract',
    date: '08 Oct 2024',
    dueDate: '08 Oct 2024',
    taxScheme: 'Agri Exempt (0% GST)',
    total: 18500,
    paid: 18500,
    remaining: 0,
    status: 'Paid',
  },
  {
    id: 'inv-5',
    invoiceNo: 'INV-2024-850',
    terminal: 'Branch Credit #1',
    customer: 'Haji Mushtaq Virk',
    cnic: '35401-4492011-9',
    details: 'Narang Mandi',
    date: '01 Sep 2024',
    dueDate: '15 Sep 2024',
    taxScheme: 'Agri Exempt (0% GST)',
    total: 78400,
    paid: 0,
    remaining: 78400,
    status: 'Overdue',
  },
];

export const InvoicesPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Paid' | 'Khata Linked' | 'Overdue'>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const filteredInvoices = useMemo(() => {
    return INVOICES_DATA.filter((inv) => {
      const matchSearch =
        inv.invoiceNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.cnic.includes(searchTerm);

      const matchStatus = statusFilter === 'all' || inv.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [searchTerm, statusFilter]);

  return (
    <div className="flex flex-col w-full gap-y-space-xl">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-20 right-8 z-50 bg-secondary text-on-secondary px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 erp-animate-pop border border-secondary-container">
          <span className="material-symbols-outlined text-[20px]">check_circle</span>
          <span className="font-label-md text-label-md font-medium">{notification}</span>
        </div>
      )}

      {/* Header Breadcrumb & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
        <div className="flex flex-col">
          <div className="flex items-center gap-space-xs font-label-sm text-label-sm text-outline mb-1">
            <span>Sales &amp; Orders</span>
            <span>/</span>
            <span className="text-primary font-semibold">Invoices Management</span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
            Tax &amp; Commercial Invoices
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl mt-0.5">
            Formal GST-registered agricultural invoices, government subsidy slips, and farmer commercial sales documentation.
          </p>
        </div>

        <div className="flex items-center gap-space-sm shrink-0 flex-wrap">
          <button
            onClick={() => window.print()}
            className="h-10 px-space-md rounded-xl bg-surface-container-lowest text-on-surface hover:bg-surface-container-low transition-all shadow-xs flex items-center gap-2 font-label-md text-label-md erp-btn-press cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px] text-outline">print</span>
            <span>Print Batch Invoices</span>
          </button>
          <button
            onClick={() => showToast('Tax Register (FBR / PRA Annexure-C) downloaded!')}
            className="h-10 px-space-md rounded-xl bg-surface-container-lowest text-on-surface hover:bg-surface-container-low transition-all shadow-xs flex items-center gap-2 font-label-md text-label-md erp-btn-press cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px] text-outline">file_download</span>
            <span>Export Tax Register (FBR/PRA)</span>
          </button>
          <Link
            to="/invoices/preview"
            className="h-10 px-space-md rounded-xl bg-primary text-on-primary hover:bg-primary-container transition-all shadow-sm flex items-center gap-2 font-label-md text-label-md font-semibold erp-btn-press"
          >
            <span className="material-symbols-outlined text-[18px]">visibility</span>
            <span>Sample Tax Invoice Preview</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter-lg">
        {/* Card 1 */}
        <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-xs flex flex-col justify-between relative overflow-hidden group erp-card-hover border border-transparent hover:border-primary/20">
          <div className="flex items-center justify-between mb-2">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Invoices Issued (This Month)</span>
            <span className="material-symbols-outlined text-primary text-[20px]">receipt_long</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-display text-on-surface font-bold">342</span>
            <span className="font-label-sm text-label-sm text-secondary font-semibold flex items-center">
              <span className="material-symbols-outlined text-[14px]">arrow_upward</span> 8.4%
            </span>
          </div>
          <div className="mt-4 pt-3 bg-surface-container-low/50 -mx-space-lg -mb-space-lg px-space-lg py-2 flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Gross Value</span>
            <span className="font-currency-cell text-currency-cell text-on-surface font-bold">Rs. 5,820,400</span>
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="flex items-center justify-between mb-2">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Fully Cleared Invoices</span>
            <span className="material-symbols-outlined text-secondary text-[20px]">check_circle</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-display text-on-surface font-bold">268</span>
            <span className="font-label-sm text-label-sm text-[#065F46] font-medium bg-[#ECFDF5] px-2 py-0.5 rounded-full">
              78.3% Settled
            </span>
          </div>
          <div className="mt-4 pt-3 bg-surface-container-low/50 -mx-space-lg -mb-space-lg px-space-lg py-2 flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Collected Capital</span>
            <span className="font-currency-cell text-currency-cell text-secondary font-bold">Rs. 4,120,000</span>
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="flex items-center justify-between mb-2">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Open Credit Receivables</span>
            <span className="material-symbols-outlined text-primary text-[20px]">account_balance_wallet</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-display text-on-surface font-bold">64</span>
            <span className="font-label-sm text-label-sm text-primary font-medium">Khata Linked</span>
          </div>
          <div className="mt-4 pt-3 bg-surface-container-low/50 -mx-space-lg -mb-space-lg px-space-lg py-2 flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Book Value</span>
            <span className="font-currency-cell text-currency-cell text-primary font-bold">Rs. 1,450,000</span>
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="flex items-center justify-between mb-2">
            <span className="font-label-sm text-label-sm text-error uppercase tracking-wider">Overdue (&gt;30 Days)</span>
            <span className="material-symbols-outlined text-error text-[20px]">warning</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-display text-error font-bold">10</span>
            <span className="font-label-sm text-label-sm text-[#991B1B] font-semibold bg-[#FEF2F2] px-2 py-0.5 rounded-full">
              Action Required
            </span>
          </div>
          <div className="mt-4 pt-3 bg-surface-container-low/50 -mx-space-lg -mb-space-lg px-space-lg py-2 flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant">At-Risk Sum</span>
            <span className="font-currency-cell text-currency-cell text-error font-bold">Rs. 250,400</span>
          </div>
        </div>
      </div>

      {/* Filter Matrix & Search */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-md flex flex-col gap-space-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-space-md py-1.5 rounded-lg font-label-md text-label-md whitespace-nowrap transition-all ${
                statusFilter === 'all'
                  ? 'bg-primary text-on-primary font-bold shadow-xs'
                  : 'text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              All Invoices <span className="ml-1 opacity-80">(342)</span>
            </button>
            <button
              onClick={() => setStatusFilter('Paid')}
              className={`px-space-md py-1.5 rounded-lg font-label-md text-label-md whitespace-nowrap transition-all ${
                statusFilter === 'Paid'
                  ? 'bg-primary text-on-primary font-bold shadow-xs'
                  : 'text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              Paid <span className="ml-1 text-secondary font-semibold">(268)</span>
            </button>
            <button
              onClick={() => setStatusFilter('Khata Linked')}
              className={`px-space-md py-1.5 rounded-lg font-label-md text-label-md whitespace-nowrap transition-all ${
                statusFilter === 'Khata Linked'
                  ? 'bg-primary text-on-primary font-bold shadow-xs'
                  : 'text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              Unpaid / Khata <span className="ml-1 text-primary font-semibold">(64)</span>
            </button>
            <button
              onClick={() => setStatusFilter('Overdue')}
              className={`px-space-md py-1.5 rounded-lg font-label-md text-label-md whitespace-nowrap transition-all ${
                statusFilter === 'Overdue'
                  ? 'bg-primary text-on-primary font-bold shadow-xs'
                  : 'text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              Overdue <span className="ml-1 text-error font-semibold">(10)</span>
            </button>
          </div>
          <span className="text-outline font-label-sm text-label-sm">
            Synced with FBR IRIS 4 mins ago
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-space-sm pt-2 bg-surface-container-low/40 p-space-sm rounded-lg">
          <div className="md:col-span-6 relative flex items-center">
            <span className="material-symbols-outlined absolute left-3 text-outline text-[18px]">search</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by Invoice #, NTN/CNIC, Farmer Name, Crop..."
              className="h-10 w-full pl-9 pr-3 rounded-lg bg-surface-container-lowest font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none shadow-sm"
            />
          </div>
          <div className="md:col-span-3">
            <select className="h-10 w-full px-3 rounded-lg bg-surface-container-lowest font-body-sm text-body-sm text-on-surface focus:outline-none shadow-sm">
              <option>Invoice Type (All)</option>
              <option>Retail Tax Invoice</option>
              <option>Subsidy Voucher</option>
              <option>Corporate B2B Bill</option>
            </select>
          </div>
          <div className="md:col-span-3 flex items-center gap-space-xs">
            <div className="h-10 px-3 bg-surface-container-lowest rounded-lg flex items-center justify-between w-full shadow-sm">
              <span className="font-body-sm text-body-sm text-on-surface flex items-center gap-1.5">
                <span className="material-symbols-outlined text-outline text-[16px]">calendar_today</span>
                <span>Oct 2024</span>
              </span>
              <span className="material-symbols-outlined text-outline text-[16px]">arrow_drop_down</span>
            </div>
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
              }}
              title="Reset Filters"
              className="h-10 w-10 shrink-0 bg-surface-container-lowest hover:bg-surface-container-low transition-colors rounded-lg flex items-center justify-center text-outline shadow-sm"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-surface-container overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider select-none">
                <th className="py-3.5 pl-6 pr-3">Invoice #</th>
                <th className="py-3.5 px-3">Farmer / Client</th>
                <th className="py-3.5 px-3">Date &amp; Due Period</th>
                <th className="py-3.5 px-3">Tax / Scheme</th>
                <th className="py-3.5 px-3 text-right">Invoice Total</th>
                <th className="py-3.5 px-3 text-right">Paid Amount</th>
                <th className="py-3.5 px-3 text-right">Remaining</th>
                <th className="py-3.5 px-3 text-center">Status</th>
                <th className="py-3.5 pr-6 pl-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="font-body-md text-body-md divide-y divide-surface-container-low">
              {filteredInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-surface-container-low/60 transition-colors">
                  <td className="py-4 pl-6 pr-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">description</span>
                      <div className="flex flex-col">
                        <span className="font-label-md text-label-md text-primary font-semibold font-mono">
                          {inv.invoiceNo}
                        </span>
                        <span className="font-label-sm text-label-sm text-outline">{inv.terminal}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-3">
                    <div className="flex flex-col">
                      <span className="font-label-md text-label-md text-on-surface font-semibold">
                        {inv.customer}
                      </span>
                      <span className="font-body-sm text-body-sm text-outline">
                        {inv.cnic} • {inv.details}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-3 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-on-surface font-medium">{inv.date}</span>
                      <span className="font-body-sm text-body-sm text-outline">Due: {inv.dueDate}</span>
                    </div>
                  </td>
                  <td className="py-4 px-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full font-label-sm text-label-sm bg-surface-container text-primary font-medium">
                      {inv.taxScheme}
                    </span>
                  </td>
                  <td className="py-4 px-3 text-right font-currency-cell text-currency-cell text-on-surface whitespace-nowrap font-bold">
                    Rs. {inv.total.toLocaleString()}
                  </td>
                  <td className="py-4 px-3 text-right font-currency-cell text-currency-cell text-secondary whitespace-nowrap font-bold">
                    Rs. {inv.paid.toLocaleString()}
                  </td>
                  <td className="py-4 px-3 text-right font-currency-cell text-currency-cell text-on-surface-variant whitespace-nowrap font-bold">
                    {inv.remaining === 0 ? (
                      <span className="text-outline">Rs. 0</span>
                    ) : (
                      <span className="text-error">Rs. {inv.remaining.toLocaleString()}</span>
                    )}
                  </td>
                  <td className="py-4 px-3 text-center whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-label-sm text-label-sm font-semibold ${
                        inv.status === 'Paid'
                          ? 'bg-[#ECFDF5] text-[#065F46]'
                          : inv.status === 'Khata Linked'
                          ? 'bg-[#EFF6FF] text-[#015AA0]'
                          : inv.status === 'Partial'
                          ? 'bg-[#FFFBEB] text-[#92400E]'
                          : 'bg-[#FEF2F2] text-[#991B1B]'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          inv.status === 'Paid'
                            ? 'bg-[#065F46]'
                            : inv.status === 'Khata Linked'
                            ? 'bg-[#015AA0]'
                            : inv.status === 'Partial'
                            ? 'bg-[#92400E]'
                            : 'bg-[#991B1B]'
                        }`}
                      ></span>
                      {inv.status}
                    </span>
                  </td>
                  <td className="py-4 pr-6 pl-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setSelectedInvoice(inv)}
                        className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface flex items-center justify-center transition-colors"
                        title="Preview & Print"
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[17px]">visibility</span>
                      </button>
                      <Link
                        to="/invoices/preview"
                        className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-surface-container text-primary flex items-center justify-center transition-colors"
                        title="Official Printable Sheet"
                      >
                        <span className="material-symbols-outlined text-[17px]">print</span>
                      </Link>
                      <button
                        onClick={() => showToast(`WhatsApp invoice link dispatched to ${inv.customer}!`)}
                        className="w-8 h-8 rounded-lg bg-[#ECFDF5] hover:bg-[#A7F3D0] text-[#065F46] flex items-center justify-center transition-colors"
                        title="Send WhatsApp Link"
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[17px]">send_to_mobile</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer Pagination */}
        <div className="px-6 py-3.5 bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-space-sm text-on-surface-variant font-label-sm text-label-sm border-t border-surface-container">
          <span>
            Showing <strong className="text-on-surface font-semibold">1 to {filteredInvoices.length}</strong> of 342 records
          </span>
          <div className="flex items-center gap-1">
            <button disabled className="px-2.5 py-1 rounded bg-surface-container-lowest text-outline disabled:opacity-40">
              <span className="material-symbols-outlined text-[16px] align-middle">chevron_left</span>
            </button>
            <button className="px-3 py-1 rounded bg-primary text-on-primary font-semibold shadow-sm">1</button>
            <button className="px-3 py-1 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface transition-colors shadow-sm">2</button>
            <button className="px-2.5 py-1 rounded bg-surface-container-lowest text-on-surface hover:bg-surface-container transition-colors shadow-sm">
              <span className="material-symbols-outlined text-[16px] align-middle">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-lg">
        <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl p-space-lg shadow-sm border border-surface-container flex flex-col justify-between">
          <div className="flex items-start gap-space-md">
            <div className="w-12 h-12 rounded-xl bg-surface-container-high flex items-center justify-center shrink-0 text-primary">
              <span className="material-symbols-outlined text-[28px]">verified</span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  Punjab Agriculture Department &amp; FBR E-Invoicing Status
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-label-sm text-label-sm bg-[#ECFDF5] text-[#065F46] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#065F46]"></span> Live
                </span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                QR-Verified Electronic Stamp Active. All systemic invoices carry official Punjab Pesticide Ordinance compliance credentials and real-time NTN transaction logs.
              </p>
            </div>
          </div>
          <div className="mt-6 pt-4 bg-surface-container-low rounded-lg p-space-md flex flex-wrap items-center justify-between gap-space-md">
            <div className="flex items-center gap-6">
              <div className="flex flex-col">
                <span className="font-label-sm text-label-sm text-outline uppercase">Integrated STRN</span>
                <span className="font-label-md text-label-md text-on-surface font-semibold">32-77-8761-229-88</span>
              </div>
              <div className="flex flex-col">
                <span className="font-label-sm text-label-sm text-outline uppercase">Punjab Fertilizer License</span>
                <span className="font-label-md text-label-md text-on-surface font-semibold">PAD-LYP-2024-9102</span>
              </div>
            </div>
            <Link to="/reports" className="text-primary font-label-md text-label-md hover:underline flex items-center gap-1 font-semibold">
              <span>Audit Integration Log</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Link>
          </div>
        </div>

        <div className="lg:col-span-5 bg-surface-container-lowest rounded-xl p-space-lg shadow-sm border border-surface-container flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                Monthly Recovery Health &amp; Aging
              </h3>
              <span className="font-label-sm text-label-sm text-outline">Net Portfolio</span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">Aging analysis of issued customer debt vs realized cash.</p>
          </div>

          <div className="my-4 flex flex-col gap-2">
            <div className="w-full h-3 rounded-full bg-surface-container-low flex overflow-hidden">
              <div className="h-full bg-secondary" style={{ width: '72%' }} title="0-15 Days: 72%"></div>
              <div className="h-full bg-tertiary-fixed-dim" style={{ width: '18%' }} title="16-30 Days: 18%"></div>
              <div className="h-full bg-error" style={{ width: '10%' }} title="30+ Days: 10%"></div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2">
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-secondary shrink-0"></span>
                  <span className="font-label-sm text-label-sm text-outline">0–15 Days</span>
                </div>
                <span className="font-headline-sm text-headline-sm text-on-surface font-bold mt-0.5">72%</span>
                <span className="font-label-sm text-label-sm text-secondary">Healthy flow</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-tertiary-fixed-dim shrink-0"></span>
                  <span className="font-label-sm text-label-sm text-outline">16–30 Days</span>
                </div>
                <span className="font-headline-sm text-headline-sm text-on-surface font-bold mt-0.5">18%</span>
                <span className="font-label-sm text-label-sm text-tertiary">Monitoring</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-error shrink-0"></span>
                  <span className="font-label-sm text-label-sm text-outline">30+ Days</span>
                </div>
                <span className="font-headline-sm text-headline-sm text-error font-bold mt-0.5">10%</span>
                <span className="font-label-sm text-label-sm text-error">Overdue</span>
              </div>
            </div>
          </div>

          <div className="pt-3 flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm border-t border-surface-container">
            <span>Recovery Target: <strong>85% in 30 days</strong></span>
            <span className="text-secondary font-semibold">On Track</span>
          </div>
        </div>
      </div>

      {/* Invoice Quick Preview Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-inverse-surface/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in-0 duration-150">
          <div className="bg-surface-container-lowest w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col erp-animate-pop border border-outline-variant/30">
            <div className="px-space-xl py-space-md bg-surface-container-low flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">receipt</span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  Invoice Preview: {selectedInvoice.invoiceNo}
                </span>
              </div>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center text-outline erp-btn-press"
                type="button"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="p-space-xl flex flex-col gap-space-lg max-h-[70vh] overflow-y-auto">
              <div className="flex justify-between items-start">
                <div className="flex flex-col">
                  <h4 className="font-headline-md text-headline-md text-primary font-bold">PESTICIDE CLUB</h4>
                  <span className="font-body-sm text-body-sm text-outline">Main Branch, Jhang Road, Faisalabad</span>
                  <span className="font-body-sm text-body-sm text-outline">STRN: 32-77-8761-229-88 • NTN: 4120934-1</span>
                </div>
                <div className="text-right flex flex-col">
                  <span className="font-headline-sm text-headline-sm text-on-surface font-bold">TAX INVOICE</span>
                  <span className="font-currency-cell text-currency-cell text-primary mt-1 font-mono font-bold">
                    {selectedInvoice.invoiceNo}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-space-md p-space-md bg-surface-container-low rounded-xl">
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm text-outline uppercase">Billed To (Farmer):</span>
                  <span className="font-label-md text-label-md text-on-surface font-semibold">
                    {selectedInvoice.customer}
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">{selectedInvoice.cnic}</span>
                </div>
                <div className="flex flex-col text-right">
                  <span className="font-label-sm text-label-sm text-outline uppercase">Invoice Metadata:</span>
                  <span className="font-body-sm text-body-sm text-on-surface">Date: <strong>{selectedInvoice.date}</strong></span>
                  <span className="font-body-sm text-body-sm text-secondary font-medium">Compliance: Verified E-Stamp</span>
                </div>
              </div>

              <div className="flex justify-between items-center p-3 rounded-xl bg-surface-container">
                <span className="font-label-md text-label-md text-on-surface font-bold">Total Invoice Amount:</span>
                <span className="font-currency-stat text-currency-stat text-primary font-bold">
                  Rs. {selectedInvoice.total.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="px-space-xl py-space-md bg-surface-container-low flex items-center justify-end gap-space-sm border-t border-surface-container">
              <button
                onClick={() => setSelectedInvoice(null)}
                className="h-10 px-space-md rounded-xl bg-surface-container-lowest text-on-surface font-label-md text-label-md shadow-sm"
                type="button"
              >
                Close
              </button>
              <Link
                to="/invoices/preview"
                className="h-10 px-space-md rounded-xl bg-primary text-on-primary font-label-md text-label-md font-semibold flex items-center gap-1.5 shadow-md"
              >
                <span className="material-symbols-outlined text-[18px]">print</span>
                <span>Open Full Printable A4</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoicesPage;
