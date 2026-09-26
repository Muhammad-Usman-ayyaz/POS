import React, { useState } from 'react';
import { Link } from 'react-router-dom';

export const InvoicePreviewPage: React.FC = () => {
  const [profile, setProfile] = useState<'a4' | 'thermal' | 'dotmatrix'>('a4');
  const [includeKhata, setIncludeKhata] = useState(true);
  const [includeAdvisory, setIncludeAdvisory] = useState(true);
  const [includeQr, setIncludeQr] = useState(true);
  const [includeUrdu, setIncludeUrdu] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  return (
    <div className="flex flex-col w-full">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-20 right-8 z-50 bg-secondary text-on-secondary px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 animate-bounce">
          <span className="material-symbols-outlined text-[20px]">check_circle</span>
          <span className="font-label-md text-label-md font-medium">{notification}</span>
        </div>
      )}

      {/* Interactive Top Action Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md mb-space-xl bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-surface-container">
        <div className="flex flex-col gap-space-xs">
          <div className="flex items-center gap-space-xs font-label-sm text-label-sm">
            <Link to="/invoices" className="text-primary hover:underline font-label-md text-label-md">
              Sales &amp; Invoices
            </Link>
            <span className="text-outline-variant font-label-md text-label-md">/</span>
            <span className="text-on-surface-variant font-label-md text-label-md font-mono">Invoice #INV-2024-892</span>
            <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-label-sm font-label-sm font-semibold">
              Seasonal Khata Credit
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
            Commercial Tax Invoice &amp; Farmer Delivery Voucher
          </h1>
        </div>

        {/* Quick Actions Group */}
        <div className="flex flex-wrap items-center gap-space-xs">
          <Link
            to="/invoices"
            className="h-9 px-space-sm rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high font-label-md text-label-md flex items-center gap-1 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            <span>Back to Invoices</span>
          </Link>
          <button
            onClick={() => showToast('PDF document rendered and saved to Downloads!')}
            className="h-9 px-space-sm rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high font-label-md text-label-md flex items-center gap-1 transition-colors"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            <span>Download PDF</span>
          </button>
          <button
            onClick={() => showToast('WhatsApp invoice dispatched to Chaudhry Riaz Ahmed (+92 300 8712394)!')}
            className="h-9 px-space-sm rounded-lg bg-[#ECFDF5] text-[#065F46] font-label-md text-label-md flex items-center gap-1 hover:bg-[#D1FAE5] transition-colors font-semibold"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">chat</span>
            <span>WhatsApp Slip</span>
          </button>
          <button
            onClick={() => showToast('Routing print job to 80mm POS thermal receipt printer...')}
            className="h-9 px-space-sm rounded-lg bg-surface-container text-primary font-label-md text-label-md flex items-center gap-1 hover:bg-surface-container-high transition-colors font-semibold"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">receipt_long</span>
            <span>Thermal (80mm)</span>
          </button>
          <button
            onClick={() => window.print()}
            className="h-9 px-space-md rounded-lg bg-primary text-on-primary font-label-md text-label-md flex items-center gap-1.5 shadow-sm hover:bg-primary-container transition-all font-semibold"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">print</span>
            <span>Print Official A4</span>
          </button>
        </div>
      </div>

      {/* Workspace 2-Column: Printable Sheet + Configuration Drawer */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter-lg items-start">
        {/* Printable Document Center Stage (9 Cols) */}
        <div className="xl:col-span-9 flex flex-col items-center">
          <div className="w-full max-w-[850px] bg-surface-container-lowest rounded-2xl shadow-xl p-space-2xl text-on-surface font-body-md border border-surface-container">
            {/* Header Banner & Organization Brand Block */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-space-lg pb-space-lg mb-space-lg bg-surface-container-low p-space-lg rounded-2xl border border-surface-container">
              <div className="flex items-start gap-space-md">
                <div className="w-14 h-14 rounded-2xl bg-primary text-on-primary flex items-center justify-center shrink-0 shadow-sm font-bold text-[28px]">
                  PC
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-headline-lg text-headline-lg font-bold tracking-tight text-primary">
                      PESTICIDE CLUB
                    </span>
                    <span className="bg-primary/10 text-primary text-label-sm font-label-sm px-2 py-0.5 rounded-full font-bold">
                      AGRI ERP
                    </span>
                  </div>
                  <span className="font-label-md text-label-md text-on-surface-variant font-semibold">
                    Agricultural Inputs, Agrochemicals &amp; Crop Advisory
                  </span>
                  <p className="font-body-sm text-body-sm text-outline mt-1 leading-snug">
                    Shop #14-16, Grain Market (Ghalla Mandi), Sargodha Road, Faisalabad<br />
                    Tel: +92 41 8472910 | Mobile: +92 300 8712394 | www.pesticideclub.pk
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-label-sm text-label-sm text-on-surface-variant mt-2 pt-2 bg-surface-container-lowest px-2 py-1 rounded-lg border border-surface-container">
                    <span><strong>NTN:</strong> 0819284-7</span>
                    <span>•</span>
                    <span><strong>STRN:</strong> 03-09-9999-012</span>
                    <span>•</span>
                    <span><strong>Punjab Agri License:</strong> #FSD-AG-2021-998</span>
                  </div>
                </div>
              </div>

              {/* Document Classification Meta */}
              <div className="flex flex-col sm:items-end text-left sm:text-right shrink-0">
                <span className="bg-primary text-on-primary px-3 py-1 rounded-lg text-label-sm font-label-sm uppercase tracking-wider font-bold">
                  Commercial Tax Invoice
                </span>
                <span className="font-headline-md text-headline-md font-bold text-primary mt-2 font-mono">
                  INV-2024-892
                </span>
                <div className="mt-2 space-y-0.5 font-label-sm text-label-sm text-on-surface-variant">
                  <p><span className="text-outline">Date:</span> <strong className="text-on-surface">12 October 2024</strong></p>
                  <p><span className="text-outline">Time:</span> 04:15 PM PST</p>
                  <p><span className="text-outline">Terminal:</span> POS Counter #01</p>
                  <p><span className="text-outline">Cashier:</span> Tariq Mehmood (OP-09)</p>
                </div>
              </div>
            </div>

            {/* Billed To / Farmer Profile */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md mb-space-lg bg-surface-container-low p-space-md rounded-xl border border-surface-container">
              <div className="flex flex-col gap-1">
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  Billed To (Farmer / Grower Account)
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    Chaudhry Riaz Ahmed
                  </span>
                  <span className="bg-surface-container-lowest text-primary font-label-sm text-label-sm px-2 py-0.5 rounded shadow-xs font-mono font-semibold">
                    Khata #FAR-042
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  <strong>CNIC:</strong> 33100-8492019-3 &nbsp;|&nbsp; <strong>Phone:</strong> +92 300 8712394<br />
                  <strong>Farm Address:</strong> Chak 42-RB, Tehsil &amp; Distt. Faisalabad
                </p>
              </div>

              <div className="flex flex-col gap-1 md:items-end md:text-right">
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  Crop Profile &amp; Credit Sanction
                </span>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  <strong>Landholding:</strong> 45 Acres (Wheat / Cotton Belt)<br />
                  <strong>Payment Terms:</strong> 30-Day Seasonal Credit (Harvest Linked)<br />
                  <strong>Maturity Date:</strong> <span className="text-error font-semibold">30 October 2024</span>
                </p>
                <span className="inline-flex items-center gap-1.5 text-secondary font-label-sm text-label-sm mt-1 bg-surface-container-lowest px-2.5 py-0.5 rounded-full shadow-xs border border-surface-container font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                  Credit Rating: Tier-1 Preferred Farmer
                </span>
              </div>
            </div>

            {/* Agrochemical Products Detail Table */}
            <div className="overflow-x-auto rounded-xl shadow-xs mb-space-lg border border-surface-container">
              <table className="w-full text-left font-body-md text-body-md border-collapse">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-3">Product Formulation &amp; Active Ingredient</th>
                    <th className="py-2.5 px-3">Batch / Lot</th>
                    <th className="py-2.5 px-3">Exp. Date</th>
                    <th className="py-2.5 px-3 text-right">Qty / Pack</th>
                    <th className="py-2.5 px-3 text-right">Unit Rate</th>
                    <th className="py-2.5 px-3 text-right">Discount</th>
                    <th className="py-2.5 px-3 text-right">Net Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-low text-on-surface">
                  <tr className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="py-3 px-3 text-center font-label-md text-label-md text-outline">01</td>
                    <td className="py-3 px-3">
                      <div className="font-headline-sm text-headline-sm text-on-surface font-semibold leading-tight">
                        Zorawar DAP Fertilizer (50kg Bag)
                      </div>
                      <div className="font-body-sm text-body-sm text-outline mt-0.5">
                        Engro Fertilizers Ltd • Nitrogen 18% / Phosphorous 46%
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-body-sm text-body-sm bg-surface-container px-2 py-0.5 rounded text-on-surface font-mono">
                        #FFC-2024-D9
                      </span>
                    </td>
                    <td className="py-3 px-3 font-body-sm text-body-sm text-on-surface-variant">Dec 2027</td>
                    <td className="py-3 px-3 text-right font-label-md text-label-md font-semibold">4 Bags</td>
                    <td className="py-3 px-3 text-right font-currency-cell text-currency-cell">Rs. 10,850</td>
                    <td className="py-3 px-3 text-right font-body-sm text-body-sm text-outline">Rs. 0</td>
                    <td className="py-3 px-3 text-right font-currency-cell text-currency-cell text-on-surface font-bold">
                      Rs. 43,400
                    </td>
                  </tr>

                  <tr className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="py-3 px-3 text-center font-label-md text-label-md text-outline">02</td>
                    <td className="py-3 px-3">
                      <div className="font-headline-sm text-headline-sm text-on-surface font-semibold leading-tight">
                        Confidor 200 SL (250ml Flacon)
                      </div>
                      <div className="font-body-sm text-body-sm text-outline mt-0.5">
                        Bayer CropScience • Active: Imidacloprid 200g/L Systemic
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-body-sm text-body-sm bg-surface-container px-2 py-0.5 rounded text-on-surface font-mono">
                        #B23-9910
                      </span>
                    </td>
                    <td className="py-3 px-3 font-body-sm text-body-sm text-on-surface-variant">Aug 2026</td>
                    <td className="py-3 px-3 text-right font-label-md text-label-md font-semibold">2 Bottles</td>
                    <td className="py-3 px-3 text-right font-currency-cell text-currency-cell">Rs. 1,650</td>
                    <td className="py-3 px-3 text-right font-body-sm text-body-sm text-outline">Rs. 0</td>
                    <td className="py-3 px-3 text-right font-currency-cell text-currency-cell text-on-surface font-bold">
                      Rs. 3,300
                    </td>
                  </tr>

                  <tr className="hover:bg-surface-container-low/50 transition-colors bg-surface-container-low/20">
                    <td className="py-3 px-3 text-center font-label-md text-label-md text-outline">03</td>
                    <td className="py-3 px-3">
                      <div className="font-headline-sm text-headline-sm text-on-surface font-semibold leading-tight">
                        Cartage &amp; Godown Loading (Palladari)
                      </div>
                      <div className="font-body-sm text-body-sm text-outline mt-0.5">
                        Loading directly to Tractor Trolley MN-8421 • Gate Pass #GP-884
                      </div>
                    </td>
                    <td className="py-3 px-3 text-outline font-mono">—</td>
                    <td className="py-3 px-3 text-outline font-mono">—</td>
                    <td className="py-3 px-3 text-right font-label-md text-label-md">1 Service</td>
                    <td className="py-3 px-3 text-right font-currency-cell text-currency-cell">Rs. 500</td>
                    <td className="py-3 px-3 text-right font-body-sm text-body-sm text-secondary font-semibold">
                      -Rs. 500 (Waived)
                    </td>
                    <td className="py-3 px-3 text-right font-currency-cell text-currency-cell text-secondary font-bold">
                      Rs. 0
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Calculations & Financial Summary Block with Ledger Impact */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-space-lg mb-space-lg items-start">
              {/* Left Notes & Crop Advisory Memo */}
              {includeAdvisory && (
                <div className="md:col-span-6 flex flex-col gap-space-sm bg-surface-container-low p-space-md rounded-xl border border-surface-container">
                  <div className="flex items-center gap-1.5 font-label-md text-label-md text-primary font-semibold">
                    <span className="material-symbols-outlined text-[18px]">eco</span>
                    <span>Crop Advisory &amp; Field Instructions</span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                    • Apply Zorawar DAP broadcast evenly at sowing time for maximum root emergence.<br />
                    • Dilute Confidor at 60ml per 100L clean water for sucking pests; spray early morning or late afternoon.<br />
                    • Keep chemicals away from direct sunlight, feedstuffs, and children.
                  </p>
                  <div className="flex items-center gap-2 mt-1 pt-2 bg-surface-container-lowest px-2.5 py-1.5 rounded-lg border border-surface-container">
                    <span className="material-symbols-outlined text-secondary text-[18px]">verified</span>
                    <span className="font-label-sm text-label-sm text-on-surface font-semibold">
                      Agronomist Review: Verified safe for Rabi Season Wheat Planting
                    </span>
                  </div>
                </div>
              )}

              {/* Right Calculation Ledger Breakdown */}
              <div className={`${includeAdvisory ? 'md:col-span-6' : 'md:col-span-12'} flex flex-col gap-1.5 bg-surface-container-low p-space-md rounded-xl border border-surface-container`}>
                <div className="flex justify-between items-center text-body-sm font-body-sm text-on-surface-variant">
                  <span>Gross Subtotal:</span>
                  <span className="font-currency-cell text-currency-cell text-on-surface font-semibold">Rs. 47,200</span>
                </div>
                <div className="flex justify-between items-center text-body-sm font-body-sm text-secondary">
                  <span>Trade Discount / Fee Waiver:</span>
                  <span className="font-currency-cell text-currency-cell font-semibold">-Rs. 500</span>
                </div>
                <div className="flex justify-between items-center text-body-sm font-body-sm text-outline">
                  <span>GST / Sales Tax (Agri 6th Sched.):</span>
                  <span className="font-currency-cell text-currency-cell">Rs. 0.00 (Exempt)</span>
                </div>
                <div className="flex justify-between items-center py-2 bg-surface-container-lowest px-3 rounded-xl font-headline-sm text-headline-sm text-primary font-bold border border-surface-container">
                  <span>Total Invoice Amount:</span>
                  <span className="font-currency-stat text-currency-stat text-primary">Rs. 46,700</span>
                </div>
                <div className="flex justify-between items-center text-body-sm font-body-sm text-outline pt-1">
                  <span>Amount Received Today (Cash):</span>
                  <span className="font-currency-cell text-currency-cell text-on-surface font-semibold">Rs. 0.00</span>
                </div>
                <div className="flex justify-between items-center text-body-sm font-body-sm text-on-surface font-semibold">
                  <span>Amount Charged to Farmer Khata:</span>
                  <span className="font-currency-cell text-currency-cell text-primary font-bold">Rs. 46,700</span>
                </div>

                {/* Khata Running Ledger Impact Box */}
                {includeKhata && (
                  <div className="mt-2 p-3 bg-surface-container-lowest rounded-xl border border-surface-container flex flex-col gap-1">
                    <div className="flex justify-between items-center text-body-sm font-body-sm text-on-surface-variant">
                      <span>Previous Khata Balance:</span>
                      <span className="font-currency-cell text-currency-cell font-semibold">Rs. 98,300</span>
                    </div>
                    <div className="flex justify-between items-center text-body-sm font-body-sm text-on-surface font-bold">
                      <span>New Total Outstanding Balance:</span>
                      <span className="font-currency-stat text-currency-stat text-primary font-bold">Rs. 145,000</span>
                    </div>
                    <span className="font-label-sm text-label-sm text-secondary flex items-center justify-end gap-1 mt-0.5 font-semibold">
                      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                      Within sanctioned farmer credit limit of Rs. 500,000
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Agro Legal Declarations & Urdu Undertaking */}
            {includeUrdu && (
              <div className="p-space-md bg-surface-container-low rounded-xl mb-space-xl flex flex-col gap-2 border border-surface-container">
                <p className="text-right font-headline-sm text-headline-sm text-on-surface leading-loose font-mono" dir="rtl">
                  تصدیق کی جاتی ہے کہ تمام ادویات اور کھادیں پنجاب زرعی محکمہ سے منظور شدہ اور رجسٹرڈ ہیں اور اصل کمپنی کی بند پیکنگ میں بغیر کسی ملاوٹ کے فراہم کی گئی ہیں۔
                </p>
                <p className="font-body-sm text-body-sm text-outline leading-snug">
                  <strong>Warranty &amp; Conditions:</strong> Standard manufacturer batch chemical warranty applies. Expired, broken, unsealed, or tamper-damaged pesticides cannot be returned or exchanged. Invoice payment is harvest-linked; delay beyond 30 Oct 2024 incurs standard service markup. All disputes subject to District Courts / Faisalabad Grain Market Association arbitration.
                </p>
              </div>
            )}

            {/* Endorsement & Dual Signatures Block */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md items-end pt-space-lg">
              {/* Farmer Verification */}
              <div className="flex flex-col items-center text-center p-space-sm bg-surface-container-low rounded-xl border border-surface-container">
                <div className="h-16 w-full flex items-end justify-center mb-1">
                  <span className="text-outline text-label-sm font-label-sm italic">[ Signature / Angootha ]</span>
                </div>
                <div className="w-full bg-outline-variant h-0.5 mb-1.5"></div>
                <span className="font-label-md text-label-md font-semibold text-on-surface">Farmer's Signature / Thumb</span>
                <span className="font-label-sm text-label-sm text-outline">Chaudhry Riaz Ahmed (CNIC: 33100-8492019-3)</span>
              </div>

              {/* Official QR Verification & Hash */}
              {includeQr && (
                <div className="flex flex-col items-center justify-center text-center p-space-sm">
                  <div className="w-24 h-24 bg-surface-container-lowest p-2 rounded-xl shadow-xs border border-surface-container flex items-center justify-center">
                    <svg className="w-full h-full text-on-surface" fill="currentColor" viewBox="0 0 100 100">
                      <rect fill="currentColor" height="28" width="28" x="0" y="0"></rect>
                      <rect fill="white" height="20" width="20" x="4" y="4"></rect>
                      <rect fill="currentColor" height="12" width="12" x="8" y="8"></rect>
                      <rect fill="currentColor" height="28" width="28" x="72" y="0"></rect>
                      <rect fill="white" height="20" width="20" x="76" y="4"></rect>
                      <rect fill="currentColor" height="12" width="12" x="80" y="8"></rect>
                      <rect fill="currentColor" height="28" width="28" x="0" y="72"></rect>
                      <rect fill="white" height="20" width="20" x="4" y="76"></rect>
                      <rect fill="currentColor" height="12" width="12" x="8" y="80"></rect>
                      <rect fill="currentColor" height="8" width="8" x="36" y="8"></rect>
                      <rect fill="currentColor" height="8" width="12" x="52" y="4"></rect>
                      <rect fill="currentColor" height="6" width="24" x="36" y="24"></rect>
                      <rect fill="currentColor" height="16" width="8" x="12" y="36"></rect>
                      <rect fill="currentColor" height="8" width="8" x="28" y="36"></rect>
                      <rect fill="currentColor" height="12" width="12" x="44" y="36"></rect>
                      <rect fill="currentColor" height="8" width="16" x="64" y="36"></rect>
                      <rect fill="currentColor" height="12" width="8" x="84" y="36"></rect>
                      <rect fill="currentColor" height="8" width="16" x="8" y="56"></rect>
                      <rect fill="currentColor" height="8" width="12" x="32" y="52"></rect>
                      <rect fill="currentColor" height="12" width="16" x="52" y="56"></rect>
                      <rect fill="currentColor" height="8" width="16" x="76" y="52"></rect>
                      <rect fill="currentColor" height="20" width="8" x="36" y="72"></rect>
                      <rect fill="currentColor" height="8" width="16" x="52" y="76"></rect>
                      <rect fill="currentColor" height="20" width="8" x="76" y="72"></rect>
                      <rect fill="currentColor" height="12" width="8" x="88" y="80"></rect>
                    </svg>
                  </div>
                  <span className="font-label-sm text-label-sm text-outline mt-1.5">Mandi Tax Authority Hash</span>
                  <span className="font-mono text-label-sm text-label-sm text-on-surface font-semibold tracking-wider">
                    SEC-9982-FSD
                  </span>
                </div>
              )}

              {/* Merchant Endorsement & Stamp */}
              <div className="flex flex-col items-center text-center p-space-sm bg-surface-container-low rounded-xl border border-surface-container">
                <div className="h-16 w-full flex items-center justify-center relative">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex flex-col items-center justify-center -rotate-12 text-primary border border-primary/30">
                    <span className="font-label-sm text-label-sm uppercase font-bold tracking-tighter text-[9px]">
                      PESTICIDE CLUB
                    </span>
                    <span className="material-symbols-outlined text-[14px]">verified</span>
                    <span className="text-[8px] font-bold">FAISALABAD</span>
                  </div>
                </div>
                <div className="w-full bg-outline-variant h-0.5 mb-1.5"></div>
                <span className="font-label-md text-label-md font-semibold text-on-surface">For Pesticide Club</span>
                <span className="font-label-sm text-label-sm text-outline">Muhammad Khan (Proprietor / Authorized)</span>
              </div>
            </div>

            {/* Official Print Footnote */}
            <div className="mt-space-xl pt-space-md bg-surface-container-low p-space-sm rounded-lg flex flex-col sm:flex-row items-center justify-between font-label-sm text-label-sm text-outline">
              <span>System Generated Voucher • Pesticide Club ERP v4.2 (Branch DB: Faisalabad Main)</span>
              <span>Original Customer Copy (Page 1 of 1)</span>
            </div>
          </div>
        </div>

        {/* Print Formats & Sheet Configuration Drawer (3 Cols) */}
        <div className="xl:col-span-3 flex flex-col gap-space-lg sticky top-20">
          {/* Format Selector Panel */}
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-surface-container">
            <div className="flex items-center gap-2 mb-space-sm">
              <span className="material-symbols-outlined text-primary text-[20px]">tune</span>
              <span className="font-headline-sm text-headline-sm text-on-surface font-bold">Output Profile</span>
            </div>
            <p className="font-body-sm text-body-sm text-outline mb-space-md">
              Select your connected print device layout profile.
            </p>

            <div className="flex flex-col gap-space-xs">
              {/* A4 Option */}
              <button
                type="button"
                onClick={() => setProfile('a4')}
                className={`w-full text-left p-space-sm rounded-xl flex items-center justify-between transition-all ${
                  profile === 'a4'
                    ? 'bg-primary text-on-primary font-bold shadow-xs'
                    : 'bg-surface-container-low hover:bg-surface-container text-on-surface'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-[20px]">description</span>
                  <div>
                    <div className="leading-tight text-label-md font-semibold">A4 Laser Document</div>
                    <div className={`text-[11px] ${profile === 'a4' ? 'text-on-primary/80' : 'text-outline'}`}>
                      Official Tax Invoice &amp; Khata Copy
                    </div>
                  </div>
                </div>
                {profile === 'a4' && <span className="material-symbols-outlined text-[18px]">check_circle</span>}
              </button>

              {/* 80mm POS Slip */}
              <button
                type="button"
                onClick={() => setProfile('thermal')}
                className={`w-full text-left p-space-sm rounded-xl flex items-center justify-between transition-all ${
                  profile === 'thermal'
                    ? 'bg-primary text-on-primary font-bold shadow-xs'
                    : 'bg-surface-container-low hover:bg-surface-container text-on-surface'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-[20px]">receipt_long</span>
                  <div>
                    <div className="leading-tight text-label-md font-semibold">80mm Thermal Slip</div>
                    <div className={`text-[11px] ${profile === 'thermal' ? 'text-on-primary/80' : 'text-outline'}`}>
                      Counter Receipt for Gate Exit
                    </div>
                  </div>
                </div>
                {profile === 'thermal' && <span className="material-symbols-outlined text-[18px]">check_circle</span>}
              </button>

              {/* Dot Matrix */}
              <button
                type="button"
                onClick={() => setProfile('dotmatrix')}
                className={`w-full text-left p-space-sm rounded-xl flex items-center justify-between transition-all ${
                  profile === 'dotmatrix'
                    ? 'bg-primary text-on-primary font-bold shadow-xs'
                    : 'bg-surface-container-low hover:bg-surface-container text-on-surface'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-[20px]">print</span>
                  <div>
                    <div className="leading-tight text-label-md font-semibold">Continuous Dot Matrix</div>
                    <div className={`text-[11px] ${profile === 'dotmatrix' ? 'text-on-primary/80' : 'text-outline'}`}>
                      3-Ply Carbon Paper Feed
                    </div>
                  </div>
                </div>
                {profile === 'dotmatrix' && <span className="material-symbols-outlined text-[18px]">check_circle</span>}
              </button>
            </div>
          </div>

          {/* Printable Components Options Card */}
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-surface-container">
            <span className="font-headline-sm text-headline-sm text-on-surface block mb-space-sm font-bold">
              Print Customization
            </span>
            <div className="space-y-space-sm">
              <label className="flex items-start gap-space-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeKhata}
                  onChange={(e) => setIncludeKhata(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded text-primary focus:ring-0"
                />
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md text-on-surface font-semibold">
                    Include Khata Running Balance
                  </span>
                  <span className="font-body-sm text-body-sm text-outline">Shows total dues &amp; credit limit health</span>
                </div>
              </label>

              <label className="flex items-start gap-space-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAdvisory}
                  onChange={(e) => setIncludeAdvisory(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded text-primary focus:ring-0"
                />
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md text-on-surface font-semibold">
                    Include Agronomist Advisory
                  </span>
                  <span className="font-body-sm text-body-sm text-outline">Dilution dosage &amp; crop instructions</span>
                </div>
              </label>

              <label className="flex items-start gap-space-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeQr}
                  onChange={(e) => setIncludeQr(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded text-primary focus:ring-0"
                />
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md text-on-surface font-semibold">
                    Print Mandi Verification QR Code
                  </span>
                  <span className="font-body-sm text-body-sm text-outline">For security check at Mandi Outpost</span>
                </div>
              </label>

              <label className="flex items-start gap-space-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeUrdu}
                  onChange={(e) => setIncludeUrdu(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded text-primary focus:ring-0"
                />
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md text-on-surface font-semibold">
                    Print Urdu Legal Warranty
                  </span>
                  <span className="font-body-sm text-body-sm text-outline">Local compliance &amp; grower disclaimer</span>
                </div>
              </label>
            </div>
          </div>

          {/* Quick Delivery & Communication Dispatch */}
          <div className="bg-primary text-on-primary rounded-xl p-space-md shadow-sm flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[22px]">send_to_mobile</span>
              <span className="font-headline-sm text-headline-sm font-semibold">Direct Grower Dispatch</span>
            </div>
            <p className="font-body-sm text-body-sm text-on-primary/90 mb-space-xs">
              Dispatch digital copy instantly to Chaudhry Riaz's WhatsApp and SMS ledger alert.
            </p>
            <button
              onClick={() => showToast('SMS & WhatsApp Receipt sent to Chaudhry Riaz Ahmed!')}
              className="w-full h-10 rounded-lg bg-surface-container-lowest text-primary font-label-md text-label-md font-semibold flex items-center justify-center gap-1.5 shadow-sm hover:bg-surface-container transition-all"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">forward_to_inbox</span>
              <span>Send SMS &amp; WhatsApp Receipt</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoicePreviewPage;
