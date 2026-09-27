import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { notify } from '@/lib/notify';

export const CustomerProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState<'overview' | 'invoices' | 'ledger' | 'payments' | 'agronomy'>('overview');

  const showToast = (msg: string) => notify(msg, 3000);

  return (
    <div className="flex flex-col w-full gap-y-space-lg">

      {/* Breadcrumbs & Context Header */}
      <div className="flex flex-wrap items-center justify-between gap-y-space-sm pb-space-xs">
        <div className="flex items-center gap-space-xs font-label-md text-label-md">
          <button
            className="text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
            onClick={() => navigate('/customers')}
            type="button"
          >
            Customers
          </button>
          <span className="text-outline-variant">/</span>
          <button
            className="text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
            onClick={() => navigate('/customers')}
            type="button"
          >
            Farmers Directory
          </button>
          <span className="text-outline-variant">/</span>
          <span className="text-primary font-semibold">
            {id ? `FAR-${id}` : 'FAR-042'} (Chaudhry Riaz Ahmed)
          </span>
        </div>
        <div className="flex items-center gap-space-sm">
          <span className="flex items-center gap-1.5 px-space-sm py-1 rounded-full bg-surface-container-high font-label-sm text-label-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-[15px] text-secondary">verified</span>
            Biometric KYC Verified (NADRA)
          </span>
          <span className="font-label-sm text-label-sm text-outline">Last Ledger Sync: 14 mins ago</span>
        </div>
      </div>

      {/* Top Profile Hero Banner Card */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-primary-fixed/30 pointer-events-none blur-3xl"></div>
        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-space-lg relative z-10">
          {/* Profile Identification and Meta Info */}
          <div className="flex flex-col sm:flex-row items-start gap-space-md min-w-0">
            {/* Avatar Badge */}
            <div className="relative shrink-0">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-primary text-on-primary font-headline-lg text-headline-lg flex items-center justify-center shadow-md select-none tracking-tight">
                CR
              </div>
              <div className="absolute -bottom-1 -right-1 bg-secondary text-on-secondary rounded-full p-1 flex items-center justify-center shadow" title="Verified Farmer">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
              </div>
            </div>

            {/* Identity and Badges */}
            <div className="flex flex-col min-w-0">
              <div className="flex flex-wrap items-center gap-space-sm">
                <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
                  Chaudhry Riaz Ahmed
                </h1>
                <span className="px-space-sm py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-label-sm text-label-sm flex items-center gap-1 font-semibold">
                  <span className="material-symbols-outlined text-[14px]">military_tech</span>
                  Gold Farmer Tier
                </span>
                <span className="px-space-sm py-0.5 rounded-full bg-surface-container-high text-primary font-label-sm text-label-sm">
                  FAR-042
                </span>
              </div>

              {/* Agriculture & Personal Metadata Matrix */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-space-lg gap-y-space-xs mt-space-sm font-body-sm text-body-sm">
                <div className="flex items-center gap-1.5 text-on-surface-variant">
                  <span className="material-symbols-outlined text-[16px] text-outline shrink-0">badge</span>
                  <span className="text-outline">CNIC:</span>
                  <span className="font-semibold text-on-surface">33100-8492019-3</span>
                </div>
                <div className="flex items-center gap-1.5 text-on-surface-variant">
                  <span className="material-symbols-outlined text-[16px] text-outline shrink-0">call</span>
                  <span className="text-outline">Phone:</span>
                  <span className="font-semibold text-on-surface">+92 300 8712394</span>
                  <span className="text-outline-variant">/</span>
                  <span className="text-on-surface-variant">+92 41 8472910</span>
                </div>
                <div className="flex items-center gap-1.5 text-on-surface-variant">
                  <span className="material-symbols-outlined text-[16px] text-outline shrink-0">location_on</span>
                  <span className="text-outline">Mouza:</span>
                  <span className="font-medium text-on-surface">Chak 42-RB, Faisalabad Rd</span>
                </div>
                <div className="flex items-center gap-1.5 text-on-surface-variant">
                  <span className="material-symbols-outlined text-[16px] text-outline shrink-0">landscape</span>
                  <span className="text-outline">Holding:</span>
                  <span className="font-medium text-on-surface">45 Acres (30 Irr., 15 Canal)</span>
                </div>
                <div className="flex items-center gap-1.5 text-on-surface-variant sm:col-span-2">
                  <span className="material-symbols-outlined text-[16px] text-outline shrink-0">agriculture</span>
                  <span className="text-outline">Crops:</span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-container-low font-medium text-primary">
                    Wheat (Rabi)
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-container-low font-medium text-secondary">
                    BT Cotton (Kharif)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons Ribbon */}
          <div className="flex flex-wrap xl:flex-col items-stretch gap-space-xs shrink-0 pt-space-xs xl:pt-0">
            <button
              className="h-10 px-space-md rounded-lg bg-primary text-on-primary font-label-md text-label-md flex items-center justify-center gap-1.5 hover:bg-primary-container shadow-sm transition-all active:scale-[0.98] cursor-pointer"
              onClick={() => navigate('/pos')}
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">point_of_sale</span>
              <span>+ New Counter Sale (POS)</span>
            </button>
            <button
              className="h-9 px-space-sm rounded-lg bg-secondary text-on-secondary font-label-md text-label-md flex items-center justify-center gap-1.5 hover:opacity-95 shadow-sm transition-all cursor-pointer"
              onClick={() => navigate('/payments')}
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">payments</span>
              <span>Record Khata Payment</span>
            </button>
            <div className="flex items-center gap-space-xs">
              <button
                className="flex-1 h-9 px-space-sm rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                onClick={() => window.print()}
                type="button"
              >
                <span className="material-symbols-outlined text-[17px] text-outline">picture_as_pdf</span>
                <span>Print Khata PDF</span>
              </button>
              <button
                className="h-9 w-9 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface flex items-center justify-center transition-colors cursor-pointer"
                onClick={() => showToast('Editing farmer profile metadata...')}
                title="Edit Profile"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">edit</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Key Financial KPI Cards (4-column layout) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
        {/* KPI 1: Lifetime Purchases */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="flex items-center justify-between text-outline">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-medium">
              Total Lifetime Purchases
            </span>
            <div className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors">
              <span className="material-symbols-outlined text-[18px]">shopping_bag</span>
            </div>
          </div>
          <div className="mt-space-sm">
            <div className="font-currency-stat text-currency-stat text-on-surface">Rs. 1,450,000</div>
            <div className="flex items-center gap-1 mt-1 text-on-surface-variant font-body-sm text-body-sm">
              <span className="material-symbols-outlined text-[15px] text-secondary">inventory_2</span>
              <span>Across 18 Store Visits &amp; Slips</span>
            </div>
          </div>
          <div className="mt-space-sm pt-space-xs bg-surface-container-low/50 -mx-space-md -mb-space-md px-space-md py-1.5 flex items-center justify-between text-label-sm font-label-sm">
            <span className="text-outline">Avg Bill Size:</span>
            <span className="font-semibold text-on-surface">Rs. 80,555</span>
          </div>
        </div>

        {/* KPI 2: Total Payments Settled */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="flex items-center justify-between text-outline">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-medium">
              Payments Settled
            </span>
            <div className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary group-hover:bg-secondary group-hover:text-on-secondary transition-colors">
              <span className="material-symbols-outlined text-[18px]">verified</span>
            </div>
          </div>
          <div className="mt-space-sm">
            <div className="font-currency-stat text-currency-stat text-secondary">Rs. 1,305,000</div>
            <div className="flex items-center gap-1.5 mt-1 font-body-sm text-body-sm">
              <span className="px-1.5 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed font-semibold text-label-sm font-label-sm">
                90.0% Cleared
              </span>
              <span className="text-on-surface-variant">Strong Repayment Track</span>
            </div>
          </div>
          <div className="mt-space-sm pt-space-xs bg-surface-container-low/50 -mx-space-md -mb-space-md px-space-md py-1.5 flex items-center justify-between text-label-sm font-label-sm">
            <span className="text-outline">Settled Invoices:</span>
            <span className="font-semibold text-secondary">15 Cleared / 3 Partial</span>
          </div>
        </div>

        {/* KPI 3: Current Khata Outstanding */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="flex items-center justify-between text-outline">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-error font-medium">
              Current Khata Due
            </span>
            <div className="w-8 h-8 rounded-lg bg-error-container flex items-center justify-center text-error group-hover:bg-error group-hover:text-on-error transition-colors">
              <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
            </div>
          </div>
          <div className="mt-space-sm">
            <div className="font-currency-stat text-currency-stat text-error">Rs. 145,000</div>
            <div className="flex items-center gap-1.5 mt-1 font-body-sm text-body-sm">
              <span className="px-1.5 py-0.5 rounded bg-error-container text-on-error-container font-semibold text-label-sm font-label-sm flex items-center gap-0.5">
                <span className="material-symbols-outlined text-[12px]">schedule</span>
                30 Oct 2024
              </span>
              <span className="text-on-surface-variant truncate">Harvest Linked</span>
            </div>
          </div>
          <div className="mt-space-sm pt-space-xs bg-surface-container-low/50 -mx-space-md -mb-space-md px-space-md py-1.5 flex items-center justify-between text-label-sm font-label-sm">
            <span className="text-outline">Overdue Stage:</span>
            <span className="font-semibold text-tertiary">Grace Period Active</span>
          </div>
        </div>

        {/* KPI 4: Credit Limit & Utilization */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="flex items-center justify-between text-outline">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-medium">
              Credit Limit Available
            </span>
            <div className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors">
              <span className="material-symbols-outlined text-[18px]">speed</span>
            </div>
          </div>
          <div className="mt-space-sm">
            <div className="font-currency-stat text-currency-stat text-primary">Rs. 155,000</div>
            <div className="flex items-center justify-between mt-1 text-on-surface-variant font-body-sm text-body-sm">
              <span>of Rs. 300,000 Ceiling</span>
              <span className="font-semibold text-primary">48.3% Used</span>
            </div>
            {/* Utilization Progress Track */}
            <div className="w-full bg-surface-container h-2 rounded-full mt-2 overflow-hidden">
              <div className="bg-primary h-full rounded-full transition-all duration-500" style={{ width: '48.3%' }}></div>
            </div>
          </div>
          <div className="mt-space-sm pt-space-xs bg-surface-container-low/50 -mx-space-md -mb-space-md px-space-md py-1.5 flex items-center justify-between text-label-sm font-label-sm">
            <span className="text-outline">Health Check:</span>
            <span className="font-semibold text-secondary flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
              Safe Buffer
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Segment Tabs */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm p-1.5 flex items-center gap-1 overflow-x-auto text-label-md font-label-md">
        <button
          className={`px-space-md py-2 rounded-lg font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-surface-container-high text-primary shadow-xs'
              : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
          }`}
          onClick={() => setActiveTab('overview')}
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">dashboard</span>
          <span>Overview &amp; Agronomy</span>
        </button>
        <button
          className={`px-space-md py-2 rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'invoices'
              ? 'bg-surface-container-high text-primary shadow-xs font-semibold'
              : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
          }`}
          onClick={() => setActiveTab('invoices')}
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">receipt_long</span>
          <span>Purchases &amp; Invoices (18)</span>
        </button>
        <button
          className={`px-space-md py-2 rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'ledger'
              ? 'bg-surface-container-high text-primary shadow-xs font-semibold'
              : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
          }`}
          onClick={() => navigate('/khata')}
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">menu_book</span>
          <span>Khata Ledger Statement</span>
        </button>
        <button
          className={`px-space-md py-2 rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'payments'
              ? 'bg-surface-container-high text-primary shadow-xs font-semibold'
              : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
          }`}
          onClick={() => navigate('/payments')}
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">request_quote</span>
          <span>Payment Receipts (14)</span>
        </button>
        <button
          className={`px-space-md py-2 rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'agronomy'
              ? 'bg-surface-container-high text-primary shadow-xs font-semibold'
              : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
          }`}
          onClick={() => setActiveTab('agronomy')}
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">science</span>
          <span>Agronomy Soil Notes</span>
        </button>
      </div>

      {/* Tab Content: Split 2-Column Bespoke Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
        {/* Left Column (approx 60% -> 7 cols on lg) */}
        <div className="lg:col-span-7 flex flex-col gap-space-lg">
          {/* 1. Recent Purchases & Bill Slips Table Card */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
            <div className="p-space-md flex items-center justify-between bg-surface-container-low">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-primary text-[20px]">receipt</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Recent Purchases &amp; Bill Slips</h2>
              </div>
              <button
                className="font-label-sm text-label-sm text-primary hover:underline flex items-center gap-0.5 cursor-pointer"
                onClick={() => navigate('/invoices')}
                type="button"
              >
                <span>View All Bills</span>
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface font-label-sm text-label-sm text-outline uppercase tracking-wider">
                    <th className="py-2.5 px-space-md">Invoice &amp; Date</th>
                    <th className="py-2.5 px-space-md">Items / Formulation</th>
                    <th className="py-2.5 px-space-md text-right">Total Amount</th>
                    <th className="py-2.5 px-space-md text-center">Settlement</th>
                    <th className="py-2.5 px-space-md text-right">Slip</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-low font-body-md text-body-md text-on-surface">
                  {/* Row 1 */}
                  <tr className="hover:bg-surface-container-low/40 transition-colors">
                    <td className="py-3 px-space-md align-top">
                      <div className="font-label-md text-label-md font-semibold text-primary">#INV-2024-892</div>
                      <div className="font-body-sm text-body-sm text-outline">12 Oct 2024 • 04:15 PM</div>
                      <div className="font-label-sm text-label-sm text-on-surface-variant mt-0.5">Counter Terminal #1</div>
                    </td>
                    <td className="py-3 px-space-md align-top">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-on-surface">4 Bags Zorawar DAP</span>
                        <span className="font-body-sm text-body-sm text-on-surface-variant">
                          2 Bottles Confidor 200SL (Bayer)
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-space-md align-top text-right">
                      <span className="font-currency-cell text-currency-cell text-on-surface">Rs. 46,700</span>
                    </td>
                    <td className="py-3 px-space-md align-top text-center">
                      <span className="inline-block px-2 py-0.5 rounded-full bg-surface-container-high text-primary font-label-sm text-label-sm font-semibold">
                        Khata Charged
                      </span>
                    </td>
                    <td className="py-3 px-space-md align-top text-right">
                      <button
                        className="p-1 rounded hover:bg-surface-container text-outline hover:text-primary transition-colors cursor-pointer"
                        onClick={() => showToast('Printing Bill Slip #INV-2024-892...')}
                        title="Print Slip"
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[18px]">print</span>
                      </button>
                    </td>
                  </tr>

                  {/* Row 2 */}
                  <tr className="hover:bg-surface-container-low/40 transition-colors">
                    <td className="py-3 px-space-md align-top">
                      <div className="font-label-md text-label-md font-semibold text-primary">#INV-2024-810</div>
                      <div className="font-body-sm text-body-sm text-outline">28 Sep 2024 • 11:30 AM</div>
                      <div className="font-label-sm text-label-sm text-on-surface-variant mt-0.5">Field Delivery Order</div>
                    </td>
                    <td className="py-3 px-space-md align-top">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-on-surface">6 Bottles Match 050 EC (Syngenta)</span>
                        <span className="font-body-sm text-body-sm text-on-surface-variant">
                          1 Bag Zinc Sulphate 33% 10kg
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-space-md align-top text-right">
                      <span className="font-currency-cell text-currency-cell text-on-surface">Rs. 16,900</span>
                    </td>
                    <td className="py-3 px-space-md align-top text-center">
                      <span className="inline-block px-2 py-0.5 rounded-full bg-surface-container-high text-primary font-label-sm text-label-sm font-semibold">
                        Khata Charged
                      </span>
                    </td>
                    <td className="py-3 px-space-md align-top text-right">
                      <button
                        className="p-1 rounded hover:bg-surface-container text-outline hover:text-primary transition-colors cursor-pointer"
                        onClick={() => showToast('Printing Bill Slip #INV-2024-810...')}
                        title="Print Slip"
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[18px]">print</span>
                      </button>
                    </td>
                  </tr>

                  {/* Row 3 */}
                  <tr className="hover:bg-surface-container-low/40 transition-colors">
                    <td className="py-3 px-space-md align-top">
                      <div className="font-label-md text-label-md font-semibold text-primary">#INV-2024-742</div>
                      <div className="font-body-sm text-body-sm text-outline">10 Sep 2024 • 02:40 PM</div>
                      <div className="font-label-sm text-label-sm text-on-surface-variant mt-0.5">Counter Terminal #2</div>
                    </td>
                    <td className="py-3 px-space-md align-top">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-on-surface">10 Bags Sona Urea 50kg</span>
                        <span className="font-body-sm text-body-sm text-on-surface-variant">
                          1 Drum Weedicide Bromoxynil + MCPA
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-space-md align-top text-right">
                      <div className="font-currency-cell text-currency-cell text-on-surface">Rs. 54,000</div>
                      <div className="font-body-sm text-body-sm text-secondary">Cash: Rs. 20,000</div>
                    </td>
                    <td className="py-3 px-space-md align-top text-center">
                      <span className="inline-block px-2 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-label-sm text-label-sm font-semibold">
                        Part Khata (34k)
                      </span>
                    </td>
                    <td className="py-3 px-space-md align-top text-right">
                      <button
                        className="p-1 rounded hover:bg-surface-container text-outline hover:text-primary transition-colors cursor-pointer"
                        onClick={() => showToast('Printing Bill Slip #INV-2024-742...')}
                        title="Print Slip"
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[18px]">print</span>
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="p-space-sm bg-surface flex items-center justify-between text-body-sm font-body-sm text-on-surface-variant">
              <span>Showing latest 3 transactions of 18 overall</span>
              <button
                className="px-space-sm py-1 rounded bg-surface-container-lowest hover:bg-surface-container text-primary font-semibold text-label-sm font-label-sm transition-colors cursor-pointer"
                onClick={() => navigate('/khata')}
                type="button"
              >
                Download Ledger Statement
              </button>
            </div>
          </div>

          {/* 2. Farm Soil & Pest Advisory Notes */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg relative overflow-hidden">
            <div className="flex items-center justify-between pb-space-sm">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-secondary text-[22px]">eco</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">
                  Agronomist Field Consultation &amp; Soil Profile
                </h2>
              </div>
              <span className="px-space-sm py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-semibold">
                Soil Audit: 02 Oct 2024
              </span>
            </div>

            {/* Soil Metrics Micro-Strip */}
            <div className="grid grid-cols-3 gap-space-sm my-space-sm">
              <div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col">
                <span className="font-label-sm text-label-sm text-outline">Soil Reaction</span>
                <span className="font-headline-sm text-headline-sm text-tertiary font-bold">pH 8.1</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">Alkaline Nature</span>
              </div>
              <div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col">
                <span className="font-label-sm text-label-sm text-outline">Organic Matter</span>
                <span className="font-headline-sm text-headline-sm text-secondary font-bold">0.68%</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">Low to Moderate</span>
              </div>
              <div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col">
                <span className="font-label-sm text-label-sm text-outline">Target Rabi Crop</span>
                <span className="font-headline-sm text-headline-sm text-primary font-bold">Wheat</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">Fakhr-e-Bhakkar</span>
              </div>
            </div>

            {/* Agronomist Guidance Paragraph */}
            <div className="p-space-md rounded-lg bg-surface-container-high/60 mt-space-sm relative">
              <div className="flex items-start gap-space-sm">
                <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0 text-label-sm font-semibold">
                  AG
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-label-md text-label-md font-semibold text-on-surface">
                      Dr. M. Shafique (Agronomist, Pesticide Club)
                    </span>
                    <span className="font-label-sm text-label-sm text-outline">Visited Farm Site</span>
                  </div>
                  <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                    Soil tested alkaline (<span className="font-semibold text-on-surface">pH 8.1</span>). Recommended applying{' '}
                    <span className="font-semibold text-primary">SOP (Sulphate of Potash)</span> rather than MOP to keep soil salinity in control. Spotted bollworm infestation on cotton block-B was successfully suppressed after scheduled application of{' '}
                    <span className="font-semibold text-primary">Match 050 EC</span> spray on 02 Oct. Advised winter wheat seed sowing (<span className="font-semibold text-on-surface">Fakhr-e-Bhakkar variety</span>) strictly by{' '}
                    <span className="font-semibold text-primary">10 Nov</span> with 50kg basal DAP per acre.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-space-md pt-space-xs text-label-sm font-label-sm text-outline">
              <span>Next Scheduled Soil Sampling: January 2025</span>
              <button
                className="text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                onClick={() => showToast('Opening Agronomist Consultation Note Editor...')}
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">add_notes</span>
                <span>Add Agronomy Note</span>
              </button>
            </div>
          </div>

          {/* Seed & Fertilizer Quota Tracker */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-md flex flex-col gap-space-sm">
            <div className="flex items-center justify-between">
              <span className="font-headline-sm text-headline-sm text-on-surface">Upcoming Season Pre-Booking</span>
              <span className="font-label-sm text-label-sm text-secondary font-semibold">Wheat Season 2024-25</span>
            </div>
            <div className="flex items-center gap-space-md p-space-sm rounded-lg bg-surface-container-low">
              <div className="w-12 h-12 rounded-lg bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">grain</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between font-label-md text-label-md">
                  <span className="font-semibold text-on-surface">Certified Fakhr-e-Bhakkar Wheat Seed</span>
                  <span className="text-primary font-bold">12 Bags Reserved</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                  Government Certified Blue Tag Bags. Delivery reserved at shop by 25 Oct.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (approx 40% -> 5 cols on lg) */}
        <div className="lg:col-span-5 flex flex-col gap-space-lg">
          {/* 1. Payment & Settlement History Card */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-md">
            <div className="flex items-center justify-between pb-space-sm">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-secondary text-[20px]">account_balance</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Recent Khata Settlements</h2>
              </div>
              <button
                className="font-label-sm text-label-sm text-secondary hover:underline font-semibold cursor-pointer"
                onClick={() => navigate('/payments')}
                type="button"
              >
                View All (14)
              </button>
            </div>
            <div className="flex flex-col gap-space-sm">
              {/* Settlement Entry 1 */}
              <div className="p-space-sm rounded-lg bg-surface-container-low flex items-start justify-between gap-space-sm">
                <div className="flex items-start gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-secondary text-on-secondary flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[18px]">currency_exchange</span>
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="font-label-md text-label-md font-bold text-on-surface">Rs. 25,000</span>
                      <span className="px-1.5 py-0.2 rounded bg-surface text-secondary font-label-sm text-label-sm font-semibold">
                        Cash
                      </span>
                    </div>
                    <span className="font-body-sm text-body-sm text-outline">Receipt #RCP-9012 • 05 Oct 2024</span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant mt-0.5">
                      Signed by Tariq (Cashier)
                    </span>
                  </div>
                </div>
                <button
                  className="p-1.5 rounded hover:bg-surface-container-high text-outline hover:text-primary transition-colors cursor-pointer"
                  onClick={() => showToast('Downloading Receipt Voucher #RCP-9012 PDF...')}
                  title="Download Receipt"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[18px]">download</span>
                </button>
              </div>

              {/* Settlement Entry 2 */}
              <div className="p-space-sm rounded-lg bg-surface-container-low flex items-start justify-between gap-space-sm">
                <div className="flex items-start gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-primary text-on-primary flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[18px]">send_to_mobile</span>
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="font-label-md text-label-md font-bold text-on-surface">Rs. 50,000</span>
                      <span className="px-1.5 py-0.2 rounded bg-surface text-primary font-label-sm text-label-sm font-semibold">
                        JazzCash
                      </span>
                    </div>
                    <span className="font-body-sm text-body-sm text-outline">Receipt #RCP-8840 • 15 Sep 2024</span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant mt-0.5">
                      Mobile Ref: 89401284 (Online)
                    </span>
                  </div>
                </div>
                <button
                  className="p-1.5 rounded hover:bg-surface-container-high text-outline hover:text-primary transition-colors cursor-pointer"
                  onClick={() => showToast('Downloading Receipt Voucher #RCP-8840 PDF...')}
                  title="Download Receipt"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[18px]">download</span>
                </button>
              </div>
            </div>

            <button
              className="w-full mt-space-sm py-2 rounded-lg bg-surface-container text-primary font-label-md text-label-md hover:bg-surface-container-high transition-colors font-semibold flex items-center justify-center gap-1 cursor-pointer"
              onClick={() => navigate('/khata')}
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">receipt</span>
              <span>Open Complete Farmer Khata Book</span>
            </button>
          </div>

          {/* 2. Guarantor / Reference Contact Card */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-md">
            <div className="flex items-center justify-between pb-space-sm">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-outline text-[20px]">handshake</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Guarantor &amp; Agricultural Reference</h2>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface font-label-sm text-label-sm font-semibold">
                Active
              </span>
            </div>
            <div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col gap-space-xs">
              <div className="flex items-center gap-space-sm">
                <div className="w-10 h-10 rounded-full bg-primary-fixed text-primary flex items-center justify-center font-bold text-label-lg">
                  AR
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-label-lg text-label-lg font-bold text-on-surface truncate">
                    Haji Abdul Rehman
                  </span>
                  <span className="font-label-sm text-label-sm text-primary font-medium">
                    Brother / Co-owner of tube-well land
                  </span>
                </div>
              </div>
              <div className="mt-space-xs pt-space-xs flex flex-col gap-1 font-body-sm text-body-sm">
                <div className="flex items-center gap-2 text-on-surface-variant">
                  <span className="material-symbols-outlined text-[16px] text-outline">apartment</span>
                  <span>Member Agricultural Advisory Council, Chak 42-RB</span>
                </div>
                <div className="flex items-center gap-2 text-on-surface-variant">
                  <span className="material-symbols-outlined text-[16px] text-outline">call</span>
                  <span className="font-semibold text-on-surface">0300-9841290</span>
                  <span className="text-outline-variant">•</span>
                  <span className="text-outline">Verified Contact</span>
                </div>
                <div className="flex items-center gap-2 text-on-surface-variant">
                  <span className="material-symbols-outlined text-[16px] text-outline">shield</span>
                  <span>Joint Khata Liability Signed on 15 Feb 2023</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Rapid Actions Bar Card */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-md">
            <div className="flex items-center gap-space-xs pb-space-sm">
              <span className="material-symbols-outlined text-primary text-[20px]">bolt</span>
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Rapid Khata &amp; Crop Ops</h2>
            </div>
            <div className="flex flex-col gap-space-xs font-label-md text-label-md">
              {/* Action: SMS Statement */}
              <button
                className="w-full h-10 px-space-md rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface flex items-center justify-between transition-colors group cursor-pointer"
                onClick={() => showToast('SMS statement sent to +92 300 8712394!')}
                type="button"
              >
                <div className="flex items-center gap-2 text-left">
                  <span className="material-symbols-outlined text-[18px] text-primary">sms</span>
                  <div>
                    <span className="font-semibold block leading-tight">Send SMS Khata Statement</span>
                    <span className="font-body-sm text-body-sm text-outline block leading-tight">
                      Delivers Urdu balance summary to +92 300 8712394
                    </span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-[16px] text-outline group-hover:translate-x-0.5 transition-transform">
                  chevron_right
                </span>
              </button>

              {/* Action: Adjust Credit Limit */}
              <button
                className="w-full h-10 px-space-md rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface flex items-center justify-between transition-colors group cursor-pointer"
                onClick={() => showToast('Opening Credit Limit Adjustment dialog...')}
                type="button"
              >
                <div className="flex items-center gap-2 text-left">
                  <span className="material-symbols-outlined text-[18px] text-secondary">tune</span>
                  <div>
                    <span className="font-semibold block leading-tight">Adjust Credit Limit</span>
                    <span className="font-body-sm text-body-sm text-outline block leading-tight">
                      Current Limit: Rs. 300,000 (Requires Admin Approval)
                    </span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-[16px] text-outline group-hover:translate-x-0.5 transition-transform">
                  chevron_right
                </span>
              </button>

              {/* Action: Issue Season Seed Token */}
              <button
                className="w-full h-10 px-space-md rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface flex items-center justify-between transition-colors group cursor-pointer"
                onClick={() => showToast('Issuing Punjab Agriculture Subsidy Token QR Code...')}
                type="button"
              >
                <div className="flex items-center gap-2 text-left">
                  <span className="material-symbols-outlined text-[18px] text-tertiary">token</span>
                  <div>
                    <span className="font-semibold block leading-tight">Issue Season Seed Token</span>
                    <span className="font-body-sm text-body-sm text-outline block leading-tight">
                      Generate barcode for Punjab Agriculture Subsidy
                    </span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-[16px] text-outline group-hover:translate-x-0.5 transition-transform">
                  chevron_right
                </span>
              </button>
            </div>
          </div>

          {/* Quick Delivery Dispatch / Warehouse Note */}
          <div className="bg-surface-container-high rounded-xl p-space-md text-on-surface flex items-start gap-space-sm">
            <span className="material-symbols-outlined text-primary text-[24px] shrink-0 mt-0.5">local_shipping</span>
            <div className="flex flex-col min-w-0">
              <span className="font-label-md text-label-md font-bold text-primary">Warehouse Dispatch Note</span>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5 leading-snug">
                All bulk fertilizer consignments over 20 bags are routed via Godown #2 (Sargodha Bypass road). Contact Driver Aslam for Chak 42-RB drop-off timing.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerProfilePage;
