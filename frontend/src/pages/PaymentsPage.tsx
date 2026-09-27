import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notify } from '@/lib/notify';

export const PaymentsPage: React.FC = () => {
  const navigate = useNavigate();
  const [settlementCategory, setSettlementCategory] = useState<'farmer' | 'supplier'>('farmer');
  const [amount, setAmount] = useState<number>(50000);
  const [paymentMode, setPaymentMode] = useState<string>('cash');
  const [depositAccount, setDepositAccount] = useState<string>('Main Branch Mandi Cash Drawer (Counter 01)');
  const [refNumber] = useState<string>('CASH-REC-2024-9102');
  const [narration, setNarration] = useState<string>(
    'Partial settlement towards Rabi fertilizer & weedicide bill #POS-9420. Balance to be settled post cotton ginning harvest.'
  );
  const [sendSms, setSendSms] = useState<boolean>(true);

  const currentDue = 145000;
  const creditCeiling = 300000;

  const remainingDue = Math.max(0, currentDue - amount);
  const availableHeadroom = creditCeiling - remainingDue;

  const usedPercent = Math.min(100, (remainingDue / creditCeiling) * 100);
  const freedPercent = Math.min(100 - usedPercent, (amount / creditCeiling) * 100);

  const showToast = (msg: string) => notify(msg);

  const numberToWords = (num: number): string => {
    if (num <= 0) return 'Zero Rupees';
    if (num === 145000) return 'One Hundred Forty-Five Thousand Only';
    if (num === 72500) return 'Seventy-Two Thousand Five Hundred Only';
    if (num === 50000) return 'Fifty Thousand Only';
    if (num === 25000) return 'Twenty-Five Thousand Only';
    if (num === 10000) return 'Ten Thousand Only';
    return `${num.toLocaleString()} Rupees Only`;
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    setAmount(Number(raw) || 0);
  };

  const handleSubmit = (print: boolean = false) => {
    if (amount <= 0) {
      showToast('Please enter a valid payment settlement amount!');
      return;
    }
    showToast(
      `Payment voucher of Rs. ${amount.toLocaleString()} recorded and posted to Khata successfully!${
        print ? ' Spooling print...' : ''
      }`
    );
    if (print) {
      window.print();
    }
  };

  return (
    <div className="flex flex-col w-full gap-space-lg">

      {/* Top Navigation Context */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-sm bg-surface-container-lowest p-space-lg rounded-xl shadow-sm">
        <div className="flex flex-col gap-space-xs">
          <div className="flex items-center gap-space-xs font-label-sm text-label-sm text-outline">
            <button
              className="hover:text-primary transition-colors cursor-pointer"
              onClick={() => navigate('/customers')}
              type="button"
            >
              Financials &amp; Khata
            </button>
            <span className="text-outline-variant">/</span>
            <span className="text-primary font-semibold">Record Payment</span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
            Record Financial Settlement &amp; Payment Receipt
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Post incoming farmer debt recovery or outward supplier consignment disbursement with automated ledger update.
          </p>
        </div>
        <div className="flex items-center gap-space-sm self-start md:self-auto shrink-0">
          <div className="flex items-center gap-2 px-space-md py-2 rounded-xl bg-surface-container-low text-primary">
            <span className="material-symbols-outlined text-[18px]">verified</span>
            <span className="font-label-md text-label-md">Double-entry Auto Balancing</span>
          </div>
        </div>
      </div>

      {/* Dual Workspace: Left Form & Right Live Ledger Impact */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
        {/* LEFT PANEL: Structured Settlement Form (60%) */}
        <div className="lg:col-span-7 flex flex-col gap-space-lg">
          <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col gap-space-xl">
            {/* Settlement Direction Switcher */}
            <div className="flex flex-col gap-space-xs">
              <label className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
                Settlement Category
              </label>
              <div className="grid grid-cols-2 p-1 bg-surface-container-low rounded-xl gap-1">
                <button
                  className={`flex items-center justify-center gap-2 py-2.5 px-space-md rounded-lg font-label-md text-label-md cursor-pointer transition-all ${
                    settlementCategory === 'farmer'
                      ? 'bg-surface-container-lowest text-primary shadow-sm font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                  id="tab-farmer"
                  onClick={() => setSettlementCategory('farmer')}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[18px]">agriculture</span>
                  <span>Receive From Farmer / Customer</span>
                </button>
                <button
                  className={`flex items-center justify-center gap-2 py-2.5 px-space-md rounded-lg font-label-md text-label-md cursor-pointer transition-all ${
                    settlementCategory === 'supplier'
                      ? 'bg-surface-container-lowest text-primary shadow-sm font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                  id="tab-supplier"
                  onClick={() => setSettlementCategory('supplier')}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[18px]">local_shipping</span>
                  <span>Pay To Supplier</span>
                </button>
              </div>
            </div>

            {/* Customer / Farmer Selector */}
            <div className="flex flex-col gap-space-sm">
              <div className="flex items-center justify-between">
                <label className="font-label-md text-label-md text-on-surface font-semibold flex items-center gap-1.5">
                  <span>{settlementCategory === 'farmer' ? 'Select Farmer Account' : 'Select Supplier Account'}</span>
                  <span className="text-error">*</span>
                </label>
                <button
                  className="font-label-sm text-label-sm text-primary hover:underline flex items-center gap-1 cursor-pointer"
                  onClick={() => navigate(settlementCategory === 'farmer' ? '/customers' : '/suppliers')}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[14px]">search</span>
                  <span>Browse Full Khata Directory</span>
                </button>
              </div>
              <div className="relative">
                <div className="flex items-center justify-between w-full h-[46px] px-space-md rounded-lg bg-surface-container-low text-on-surface">
                  <div className="flex items-center gap-space-sm min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-primary-fixed text-on-primary-fixed font-headline-sm text-headline-sm flex items-center justify-center shrink-0">
                      CR
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span className="font-label-lg text-label-lg text-on-surface font-semibold truncate leading-tight">
                        Chaudhry Riaz Ahmed (FAR-042)
                      </span>
                      <span className="font-body-sm text-body-sm text-outline truncate leading-tight">
                        Chak 42-RB, Salarwala Road • 45 Acres Cotton/Wheat
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="px-2 py-0.5 rounded-full font-label-sm text-label-sm bg-surface-container text-primary font-semibold">
                      Active Tier-1
                    </span>
                    <span className="material-symbols-outlined text-outline">unfold_more</span>
                  </div>
                </div>
              </div>

              {/* Customer Balance Metrics Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-space-sm p-space-md rounded-lg bg-surface-container-lowest">
                <div className="flex flex-col p-2.5 rounded-lg bg-surface-container-low">
                  <span className="font-label-sm text-label-sm text-outline">Total Balance Due</span>
                  <span className="font-currency-stat text-currency-stat text-error mt-0.5">Rs. 145,000</span>
                  <span className="font-body-sm text-body-sm text-outline leading-tight mt-0.5">3 unpaid invoices</span>
                </div>
                <div className="flex flex-col p-2.5 rounded-lg bg-surface-container-low">
                  <span className="font-label-sm text-label-sm text-outline">Credit Ceiling Limit</span>
                  <span className="font-currency-stat text-currency-stat text-on-surface mt-0.5">Rs. 300,000</span>
                  <span className="font-body-sm text-body-sm text-secondary leading-tight mt-0.5">
                    Guaranteed by Land Book
                  </span>
                </div>
                <div className="col-span-2 sm:col-span-1 flex flex-col p-2.5 rounded-lg bg-surface-container-low">
                  <span className="font-label-sm text-label-sm text-outline">Available Credit Headroom</span>
                  <span className="font-currency-stat text-currency-stat text-primary mt-0.5">Rs. 155,000</span>
                  <span className="font-body-sm text-body-sm text-outline leading-tight mt-0.5">
                    Utilization: 48.3%
                  </span>
                </div>
              </div>
            </div>

            {/* Settlement Amount Entry & Presets */}
            <div className="flex flex-col gap-space-sm">
              <div className="flex items-center justify-between">
                <label className="font-label-md text-label-md text-on-surface font-semibold flex items-center gap-1.5">
                  <span>Settlement Recovery Amount</span>
                  <span className="text-error">*</span>
                </label>
                <span className="font-label-sm text-label-sm text-outline">Pakistani Rupee (PKR)</span>
              </div>
              <div className="relative flex items-center rounded-xl bg-surface-container-low focus-within:bg-surface-container-lowest shadow-sm transition-all">
                <div className="flex items-center justify-center px-4 h-14 bg-surface-container text-primary font-headline-md text-headline-md rounded-l-xl select-none">
                  Rs.
                </div>
                <input
                  className="w-full h-14 px-4 bg-transparent font-display text-display text-on-surface focus:outline-none tracking-tight font-bold"
                  id="payment-input"
                  onChange={handleAmountChange}
                  placeholder="0"
                  type="text"
                  value={amount.toLocaleString()}
                />
                <button
                  className="p-2 mr-3 text-outline hover:text-on-surface rounded-lg cursor-pointer"
                  onClick={() => setAmount(0)}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[20px]">backspace</span>
                </button>
              </div>

              {/* Quick Amount Chips */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider mr-1">Presets:</span>
                <button
                  className={`px-3 py-1.5 rounded-lg font-label-md text-label-md font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                    amount === 145000
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'bg-surface-container hover:bg-surface-container-high text-primary'
                  }`}
                  onClick={() => setAmount(145000)}
                  type="button"
                >
                  <span>Full Settlement (Rs. 145,000)</span>
                </button>
                <button
                  className={`px-3 py-1.5 rounded-lg font-label-md text-label-md transition-colors cursor-pointer ${
                    amount === 72500
                      ? 'bg-primary text-on-primary font-semibold shadow-sm'
                      : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'
                  }`}
                  onClick={() => setAmount(72500)}
                  type="button"
                >
                  Half (Rs. 72,500)
                </button>
                <button
                  className={`px-3 py-1.5 rounded-lg font-label-md text-label-md transition-colors cursor-pointer ${
                    amount === 50000
                      ? 'bg-primary text-on-primary font-semibold shadow-sm'
                      : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'
                  }`}
                  onClick={() => setAmount(50000)}
                  type="button"
                >
                  Rs. 50,000
                </button>
                <button
                  className={`px-3 py-1.5 rounded-lg font-label-md text-label-md transition-colors cursor-pointer ${
                    amount === 25000
                      ? 'bg-primary text-on-primary font-semibold shadow-sm'
                      : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'
                  }`}
                  onClick={() => setAmount(25000)}
                  type="button"
                >
                  Rs. 25,000
                </button>
                <button
                  className={`px-3 py-1.5 rounded-lg font-label-md text-label-md transition-colors cursor-pointer ${
                    amount === 10000
                      ? 'bg-primary text-on-primary font-semibold shadow-sm'
                      : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'
                  }`}
                  onClick={() => setAmount(10000)}
                  type="button"
                >
                  Rs. 10,000
                </button>
              </div>
            </div>

            {/* Date & Payment Instruments Grid */}
            <div className="flex flex-col gap-space-sm">
              <div className="flex items-center justify-between">
                <label className="font-label-md text-label-md text-on-surface font-semibold">
                  Payment Channel &amp; Execution Mode
                </label>
                <span className="font-label-sm text-label-sm text-outline">Posting Date: 15 Oct 2024</span>
              </div>

              {/* 5 Method Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-space-xs">
                {/* 1. Cash Counter */}
                <label
                  className={`cursor-pointer relative flex flex-col items-center justify-center p-3 rounded-xl text-center gap-1 transition-all ${
                    paymentMode === 'cash'
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'bg-surface-container-low hover:bg-surface-container text-on-surface'
                  }`}
                  onClick={() => setPaymentMode('cash')}
                >
                  <input checked={paymentMode === 'cash'} className="sr-only" name="payment_mode" readOnly type="radio" />
                  <span className="material-symbols-outlined text-[24px]">payments</span>
                  <span className="font-label-md text-label-md font-semibold leading-tight mt-1">Cash Drawer</span>
                  <span className="font-label-sm text-label-sm opacity-80">Counter 01</span>
                  {paymentMode === 'cash' && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-secondary-fixed"></span>
                  )}
                </label>

                {/* 2. Bank Transfer */}
                <label
                  className={`cursor-pointer relative flex flex-col items-center justify-center p-3 rounded-xl text-center gap-1 transition-all ${
                    paymentMode === 'bank'
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'bg-surface-container-low hover:bg-surface-container text-on-surface'
                  }`}
                  onClick={() => setPaymentMode('bank')}
                >
                  <input checked={paymentMode === 'bank'} className="sr-only" name="payment_mode" readOnly type="radio" />
                  <span className="material-symbols-outlined text-[24px]">account_balance</span>
                  <span className="font-label-md text-label-md font-semibold leading-tight mt-1">Bank Transfer</span>
                  <span className="font-label-sm text-label-sm opacity-80">HBL / Meezan</span>
                </label>

                {/* 3. Easypaisa */}
                <label
                  className={`cursor-pointer relative flex flex-col items-center justify-center p-3 rounded-xl text-center gap-1 transition-all ${
                    paymentMode === 'easypaisa'
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'bg-surface-container-low hover:bg-surface-container text-on-surface'
                  }`}
                  onClick={() => setPaymentMode('easypaisa')}
                >
                  <input checked={paymentMode === 'easypaisa'} className="sr-only" name="payment_mode" readOnly type="radio" />
                  <span className="material-symbols-outlined text-[24px]">phone_android</span>
                  <span className="font-label-md text-label-md font-semibold leading-tight mt-1">Easypaisa</span>
                  <span className="font-label-sm text-label-sm opacity-80">Merchant Till</span>
                </label>

                {/* 4. JazzCash */}
                <label
                  className={`cursor-pointer relative flex flex-col items-center justify-center p-3 rounded-xl text-center gap-1 transition-all ${
                    paymentMode === 'jazzcash'
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'bg-surface-container-low hover:bg-surface-container text-on-surface'
                  }`}
                  onClick={() => setPaymentMode('jazzcash')}
                >
                  <input checked={paymentMode === 'jazzcash'} className="sr-only" name="payment_mode" readOnly type="radio" />
                  <span className="material-symbols-outlined text-[24px]">send_to_mobile</span>
                  <span className="font-label-md text-label-md font-semibold leading-tight mt-1">JazzCash</span>
                  <span className="font-label-sm text-label-sm opacity-80">Retail Agent</span>
                </label>

                {/* 5. Cheque */}
                <label
                  className={`cursor-pointer relative flex flex-col items-center justify-center p-3 rounded-xl text-center gap-1 transition-all col-span-2 sm:col-span-1 ${
                    paymentMode === 'cheque'
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'bg-surface-container-low hover:bg-surface-container text-on-surface'
                  }`}
                  onClick={() => setPaymentMode('cheque')}
                >
                  <input checked={paymentMode === 'cheque'} className="sr-only" name="payment_mode" readOnly type="radio" />
                  <span className="material-symbols-outlined text-[24px]">receipt_long</span>
                  <span className="font-label-md text-label-md font-semibold leading-tight mt-1">Cheque / PO</span>
                  <span className="font-label-sm text-label-sm opacity-80">Clearing</span>
                </label>
              </div>
            </div>

            {/* Dual Detail Fields: Deposit Target & Reference Number */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-label-md text-on-surface font-semibold">
                  Deposit Account / Cashier Till
                </label>
                <div className="flex items-center gap-2 h-10 px-3 bg-surface-container-low rounded-lg text-on-surface">
                  <span className="material-symbols-outlined text-[18px] text-primary">point_of_sale</span>
                  <select
                    className="w-full bg-transparent font-body-md text-body-md text-on-surface focus:outline-none cursor-pointer"
                    onChange={(e) => setDepositAccount(e.target.value)}
                    value={depositAccount}
                  >
                    <option>Main Branch Mandi Cash Drawer (Counter 01)</option>
                    <option>Meezan Bank - A/C #0239-0104928192 (Ops)</option>
                    <option>Habib Bank Ltd - A/C #1102-99381029 (Wheat Collection)</option>
                    <option>Vault Safe - Branch Main</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-label-md text-on-surface font-semibold">
                  Transaction Slip / Ref #
                </label>
                <div className="flex items-center gap-2 h-10 px-3 bg-surface-container-low rounded-lg text-on-surface">
                  <span className="material-symbols-outlined text-[18px] text-outline">tag</span>
                  <input
                    className="w-full bg-transparent font-label-md text-label-md text-on-surface focus:outline-none font-semibold uppercase"
                    readOnly
                    type="text"
                    value={refNumber}
                  />
                  <span className="px-1.5 py-0.5 rounded bg-surface text-outline font-label-sm text-label-sm">
                    Auto
                  </span>
                </div>
              </div>
            </div>

            {/* Narration & Ledger Remarks */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="font-label-md text-label-md text-on-surface font-semibold">
                  Ledger Narration &amp; Purpose
                </label>
                <span className="font-body-sm text-body-sm text-outline">{narration.length}/250 chars</span>
              </div>
              <textarea
                className="w-full p-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest shadow-inner resize-none"
                onChange={(e) => setNarration(e.target.value)}
                rows={2}
                value={narration}
              ></textarea>
            </div>

            {/* SMS Alert Notice Toggle */}
            <div className="flex items-center justify-between p-3.5 bg-success-soft rounded-xl">
              <div className="flex items-center gap-space-sm min-w-0">
                <div className="w-9 h-9 rounded-lg bg-success-line text-success flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[20px]">sms</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-label-md text-label-md text-success font-semibold truncate leading-tight">
                    Send Instant Khata SMS Voucher
                  </span>
                  <span className="font-body-sm text-body-sm text-success/80 truncate leading-tight">
                    Dispatched to Chaudhry Riaz: <span className="font-semibold">+92 300 8712394</span>
                  </span>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  checked={sendSms}
                  className="sr-only peer"
                  onChange={(e) => setSendSms(e.target.checked)}
                  type="checkbox"
                />
                <div className="w-11 h-6 bg-surface-dim peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-secondary"></div>
              </label>
            </div>

            {/* Action Command Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-space-md pt-space-xs">
              <button
                className="w-full sm:w-auto px-space-lg py-2.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                onClick={() => setAmount(50000)}
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
                <span>Discard &amp; Reset</span>
              </button>
              <div className="flex items-center gap-space-sm w-full sm:w-auto">
                <button
                  className="w-full sm:w-auto px-space-lg py-2.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-primary font-label-md text-label-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  onClick={() => handleSubmit(true)}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[18px]">print</span>
                  <span>Save &amp; Print Receipt</span>
                </button>
                <button
                  className="w-full sm:w-auto px-space-xl py-2.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md font-semibold shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  onClick={() => handleSubmit(false)}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[20px]">check_circle</span>
                  <span>Confirm &amp; Post Payment (Rs. {amount.toLocaleString()})</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Live Ledger Impact & Account Preview (40%) */}
        <div className="lg:col-span-5 flex flex-col gap-space-lg">
          {/* 1. Projected Ledger Impact Card */}
          <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
            <div className="flex items-center justify-between pb-space-xs">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-surface-container-high text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">calculate</span>
                </span>
                <span className="font-headline-sm text-headline-sm text-on-surface">Live Ledger Impact</span>
              </div>
              <span className="px-2 py-0.5 rounded-full font-label-sm text-label-sm bg-success-soft text-success font-semibold">
                Immediate Khata Recalculation
              </span>
            </div>
            <div className="flex flex-col gap-2 p-space-md bg-surface-container-low rounded-xl">
              <div className="flex items-center justify-between text-body-md font-body-md text-on-surface-variant">
                <span>Prior Ledger Balance Due</span>
                <span className="font-currency-cell text-currency-cell text-on-surface">Rs. 145,000</span>
              </div>
              <div className="flex items-center justify-between text-body-md font-body-md text-secondary font-semibold">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px]">remove_circle</span>
                  <span>Payment Credit Applied</span>
                </span>
                <span className="font-currency-cell text-currency-cell text-secondary">
                  - Rs. {amount.toLocaleString()}
                </span>
              </div>
              <div className="h-px bg-outline-variant/40 my-1"></div>
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md text-on-surface font-semibold">Projected Remaining Due</span>
                  <span className="font-body-sm text-body-sm text-outline">Post-voucher balance</span>
                </div>
                <span className="font-currency-stat text-currency-stat text-primary font-bold">
                  Rs. {remainingDue.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Gauge / Bar indicator for credit limit restoration */}
            <div className="flex flex-col gap-1.5 p-space-sm bg-surface-container-lowest rounded-lg">
              <div className="flex items-center justify-between font-label-sm text-label-sm">
                <span className="text-outline">Restored Credit Headroom:</span>
                <span className="text-secondary font-semibold">Rs. {availableHeadroom.toLocaleString()} Available</span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden flex">
                <div className="bg-error h-full transition-all duration-300" style={{ width: `${usedPercent}%` }}></div>
                <div className="bg-secondary-fixed-dim h-full transition-all duration-300" style={{ width: `${freedPercent}%` }}></div>
                <div className="bg-surface-container h-full flex-1"></div>
              </div>
              <div className="flex items-center justify-between text-body-sm font-body-sm text-outline pt-0.5">
                <span>Limit: Rs. 300,000</span>
                <span className="text-secondary font-semibold">
                  +{(freedPercent).toFixed(1)}% unlocked for Rabi sowing
                </span>
              </div>
            </div>
          </div>

          {/* 2. Digital Receipt Voucher Live Preview */}
          <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-sm relative overflow-hidden">
            <div className="flex items-center justify-between pb-space-xs">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-outline">receipt</span>
                <span className="font-label-md text-label-md text-outline uppercase tracking-wider">
                  Khata Slip Preview
                </span>
              </div>
              <span className="font-label-sm text-label-sm text-primary font-semibold">Official Receipt #9102</span>
            </div>

            {/* Slip Container with subtle print-paper styling */}
            <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-space-sm text-on-surface">
              {/* Receipt Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <img
                    alt="Pesticide Club Official Insignia"
                    className="h-7 w-auto object-contain"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuDx6C6tbE8rGoIj7PtvO7ATDSW0mQl2crdSrE0tm3xhFa-OpplAbc5JzT6QxmpjE-tAKyEep6KdFtN_4poE8TgbESWXd881scoeEYwV8v3PatCYp3KNvkQdVc7Mv_wqXAJAtW3lBln__rHRnbTKkiBglMYi_YLrMUFoRJNwW3FgVy0UeRg4BgMcDuBhQhXM-_k9NqbW27owLCJZ8VVp87jv8nfS2hA4n55YvOYiLwCZeXXNEGEsPF6MyA"
                  />
                  <div className="flex flex-col">
                    <span className="font-headline-sm text-headline-sm text-primary leading-none">Pesticide Club</span>
                    <span className="font-label-sm text-label-sm text-outline leading-tight">
                      Mandi Road, Faisalabad
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-label-sm text-label-sm text-outline block">VOUCHER NO.</span>
                  <span className="font-label-md text-label-md font-bold text-on-surface">#RCP-2024-9102</span>
                </div>
              </div>

              <div className="h-px bg-outline-variant/30 my-0.5"></div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-2 gap-2 text-body-sm font-body-sm">
                <div>
                  <span className="text-outline block text-label-sm font-label-sm">RECEIVED FROM</span>
                  <span className="font-semibold text-on-surface">Chaudhry Riaz Ahmed</span>
                  <span className="text-outline block text-[11px]">Chak 42-RB (Khata #042)</span>
                </div>
                <div className="text-right">
                  <span className="text-outline block text-label-sm font-label-sm">DATE &amp; TIME</span>
                  <span className="font-semibold text-on-surface">15 Oct 2024, 04:30 PM</span>
                  <span className="text-outline block text-[11px]">Shift Counter 01</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-surface-container-lowest flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm text-outline uppercase">Sum of Rupees</span>
                  <span className="font-body-sm text-body-sm font-semibold text-primary">
                    {numberToWords(amount)}
                  </span>
                </div>
                <span className="font-currency-stat text-currency-stat text-on-surface">
                  PKR {amount.toLocaleString()}
                </span>
              </div>

              {/* Receipt Footer Stamp */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  {/* QR Simulation for Verification */}
                  <svg className="w-10 h-10 text-on-surface-variant bg-surface-container-lowest p-0.5 rounded shadow-sm shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M2 2h8v8H2V2zm2 2v4h4V4H4zm10-2h8v8h-8V2zm2 2v4h4V4h-4zM2 14h8v8H2v-8zm2 2v4h4v-4H4zm14-2h4v2h-4v-2zm-4 0h2v4h-2v-4zm2 2h2v4h-2v-4zm2 2h2v2h-2v-2zm-6 2h4v2h-4v-2zm4 2h4v2h-4v-2zm-4-14h2v2h-2V4zm2 2h2v2h-2V6zm-2 2h2v2h-2V8zm8-4h2v2h-2V4zm0 4h2v2h-2V8zM4 4h4v4H4V4zm12 0h4v4h-4V4zM4 16h4v4H4v-4z"></path>
                  </svg>
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm text-outline">Authorised Cashier</span>
                    <span className="font-label-md text-label-md font-semibold text-on-surface">Muhammad Khan</span>
                    <span className="font-body-sm text-body-sm text-secondary">Verified Signature ✓</span>
                  </div>
                </div>
                <div className="px-2 py-1 rounded bg-surface-container font-label-sm text-label-sm text-outline font-semibold">
                  ORIGINAL KHATA
                </div>
              </div>
            </div>
          </div>

          {/* 3. Recent 3 Payments from this Farmer */}
          <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-sm">
            <div className="flex items-center justify-between pb-space-xs">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-primary">history</span>
                <span className="font-headline-sm text-headline-sm text-on-surface">Settlement History</span>
              </div>
              <span className="font-label-sm text-label-sm text-outline">Last 3 receipts</span>
            </div>
            <div className="flex flex-col gap-2">
              {/* Row 1 */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container transition-colors">
                <div className="flex items-center gap-space-sm">
                  <div className="w-8 h-8 rounded-lg bg-danger-tint text-error flex items-center justify-center">
                    <span className="material-symbols-outlined text-[16px]">send_to_mobile</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface font-semibold">Rs. 25,000</span>
                    <span className="font-body-sm text-body-sm text-outline">05 Oct 2024 • JazzCash Direct</span>
                  </div>
                </div>
                <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-success-soft text-success font-semibold">
                  Posted
                </span>
              </div>

              {/* Row 2 */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container transition-colors">
                <div className="flex items-center gap-space-sm">
                  <div className="w-8 h-8 rounded-lg bg-surface-container-high text-primary flex items-center justify-center">
                    <span className="material-symbols-outlined text-[16px]">payments</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface font-semibold">Rs. 50,000</span>
                    <span className="font-body-sm text-body-sm text-outline">15 Sep 2024 • Cash Counter 01</span>
                  </div>
                </div>
                <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-success-soft text-success font-semibold">
                  Posted
                </span>
              </div>

              {/* Row 3 */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container transition-colors">
                <div className="flex items-center gap-space-sm">
                  <div className="w-8 h-8 rounded-lg bg-surface-container-high text-primary flex items-center justify-center">
                    <span className="material-symbols-outlined text-[16px]">account_balance</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface font-semibold">Rs. 30,000</span>
                    <span className="font-body-sm text-body-sm text-outline">01 Aug 2024 • Meezan Bank IBFT</span>
                  </div>
                </div>
                <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-success-soft text-success font-semibold">
                  Posted
                </span>
              </div>
            </div>
            <button
              className="w-full py-2 text-center font-label-md text-label-md text-primary hover:text-primary-container transition-colors cursor-pointer"
              onClick={() => navigate('/khata')}
              type="button"
            >
              View Farmer&apos;s Entire Consolidated Ledger Record →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentsPage;
