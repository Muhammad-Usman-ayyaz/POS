import React, { useState } from 'react';

interface AuditMovementRow {
  id: number;
  date: string;
  time: string;
  productName: string;
  productDesc: string;
  icon: string;
  iconColor: string;
  batch: string;
  type: 'grn' | 'pos' | 'damage' | 'adjustment' | 'return' | 'transfer';
  typeLabel: string;
  typeIcon: string;
  typeBadgeClass: string;
  qtyDelta: string;
  qtyDeltaClass: string;
  balanceAfter: string;
  balanceLocation: string;
  refNumber: string;
  refClass: string;
  refIcon: string;
  staffInitials: string;
  staffName: string;
  staffRole: string;
  notes: string;
  actionIcon: string;
  actionTitle: string;
}

const AUDIT_ROWS: AuditMovementRow[] = [
  {
    id: 1,
    date: '14 Oct 2024',
    time: '02:45 PM • PKT',
    productName: 'Confidor 200 SL',
    productDesc: 'Bayer • 250ml Liquid Pack',
    icon: 'science',
    iconColor: 'text-primary',
    batch: '#B23-9910',
    type: 'grn',
    typeLabel: 'Purchase / GRN',
    typeIcon: 'add_circle',
    typeBadgeClass: 'bg-surface-container-high text-secondary',
    qtyDelta: '+150 Units',
    qtyDeltaClass: 'text-secondary font-bold text-[15px]',
    balanceAfter: '245 Units',
    balanceLocation: 'Main Godown A',
    refNumber: 'GRN-2024-089',
    refClass: 'text-primary',
    refIcon: 'open_in_new',
    staffInitials: 'AK',
    staffName: 'Asif Ali',
    staffRole: 'Storekeeper',
    notes: 'Supplier truck offloading Bayer consignments',
    actionIcon: 'verified',
    actionTitle: 'View Verification Hash',
  },
  {
    id: 2,
    date: '14 Oct 2024',
    time: '01:18 PM • PKT',
    productName: 'Zorawar DAP Fertilizer',
    productDesc: 'Engro Agri • 50kg Bag',
    icon: 'agriculture',
    iconColor: 'text-primary',
    batch: '#DAP-7701',
    type: 'pos',
    typeLabel: 'POS Sale',
    typeIcon: 'shopping_cart_checkout',
    typeBadgeClass: 'bg-primary-fixed text-primary',
    qtyDelta: '-12 Bags',
    qtyDeltaClass: 'text-primary font-bold text-[15px]',
    balanceAfter: '42 Bags',
    balanceLocation: 'POS Front Yard',
    refNumber: 'POS-#9420',
    refClass: 'text-primary',
    refIcon: 'receipt',
    staffInitials: 'TM',
    staffName: 'Tariq Mehmood',
    staffRole: 'Lead Cashier',
    notes: 'Counter cash sale to Chaudhry Bashir (Chak 42-SB)',
    actionIcon: 'receipt_long',
    actionTitle: 'Print Invoice Duplicate',
  },
  {
    id: 3,
    date: '14 Oct 2024',
    time: '11:05 AM • PKT',
    productName: 'Karate 2.5 EC',
    productDesc: 'Syngenta • 1 Litre Bottle',
    icon: 'water_drop',
    iconColor: 'text-error',
    batch: '#SYN-2209',
    type: 'damage',
    typeLabel: 'Damaged / Spoilage',
    typeIcon: 'delete_forever',
    typeBadgeClass: 'bg-error-container text-on-error-container',
    qtyDelta: '-1 Unit',
    qtyDeltaClass: 'text-error font-bold text-[15px]',
    balanceAfter: '18 Units',
    balanceLocation: 'Vault 02 Written-Off',
    refNumber: 'DMG-2024-019',
    refClass: 'text-error',
    refIcon: 'description',
    staffInitials: 'MK',
    staffName: 'Muhammad Khan',
    staffRole: 'Owner / Approved',
    notes: 'Seal punctured during forklift rack positioning in godown',
    actionIcon: 'policy',
    actionTitle: 'View Disposal Certificate',
  },
  {
    id: 4,
    date: '13 Oct 2024',
    time: '06:30 PM • PKT',
    productName: 'Match 050 EC',
    productDesc: 'Syngenta • 500ml Insecticide',
    icon: 'pest_control',
    iconColor: 'text-primary',
    batch: '#MT-8842',
    type: 'adjustment',
    typeLabel: 'Adjustment (+)',
    typeIcon: 'tune',
    typeBadgeClass: 'bg-surface-container text-on-surface',
    qtyDelta: '+5 Units',
    qtyDeltaClass: 'text-secondary font-bold text-[15px]',
    balanceAfter: '38 Units',
    balanceLocation: 'Audit Surplus Matched',
    refNumber: 'ADJ-104',
    refClass: 'text-primary',
    refIcon: 'tune',
    staffInitials: 'MK',
    staffName: 'Muhammad Khan',
    staffRole: 'Owner',
    notes: 'Physical stock count reconciliation vs previous manual register',
    actionIcon: 'history',
    actionTitle: 'Audit Trail Log',
  },
  {
    id: 5,
    date: '13 Oct 2024',
    time: '03:40 PM • PKT',
    productName: 'SOP Potassium Sulphate',
    productDesc: 'FFC Fertilizer • 25kg Bag',
    icon: 'assignment_return',
    iconColor: 'text-secondary',
    batch: '#FFC-9912',
    type: 'return',
    typeLabel: 'Customer Return',
    typeIcon: 'undo',
    typeBadgeClass: 'bg-surface-container-high text-secondary',
    qtyDelta: '+2 Bags',
    qtyDeltaClass: 'text-secondary font-bold text-[15px]',
    balanceAfter: '14 Bags',
    balanceLocation: 'Front Yard Returned',
    refNumber: 'RET-042',
    refClass: 'text-primary',
    refIcon: 'replay',
    staffInitials: 'TM',
    staffName: 'Tariq Mehmood',
    staffRole: 'Lead Cashier',
    notes: 'Unopened bag returned by farmer; credit voucher credited to Khata',
    actionIcon: 'account_balance_wallet',
    actionTitle: 'View Customer Credit Voucher',
  },
  {
    id: 6,
    date: '12 Oct 2024',
    time: '10:15 AM • PKT',
    productName: 'Emamectin Benzoate 1.9 EC',
    productDesc: 'Four Brothers • 500ml Bottled',
    icon: 'forklift',
    iconColor: 'text-outline',
    batch: '#EM-4100',
    type: 'transfer',
    typeLabel: 'Transfer: Godown 2',
    typeIcon: 'swap_horiz',
    typeBadgeClass: 'bg-surface-container text-on-surface-variant',
    qtyDelta: '-40 Units',
    qtyDeltaClass: 'text-on-surface-variant font-bold text-[15px]',
    balanceAfter: '60 Units',
    balanceLocation: 'Transferred to Dep. 2',
    refNumber: 'TRF-2024-031',
    refClass: 'text-primary',
    refIcon: 'local_shipping',
    staffInitials: 'AK',
    staffName: 'Asif Ali',
    staffRole: 'Storekeeper',
    notes: 'Internal replenishment dispatch for Sub-Branch 02 depot',
    actionIcon: 'local_shipping',
    actionTitle: 'View Waybill Slip',
  },
  {
    id: 7,
    date: '12 Oct 2024',
    time: '09:12 AM • PKT',
    productName: 'Curacron 500 EC',
    productDesc: 'Syngenta • 1 Litre Can',
    icon: 'yard',
    iconColor: 'text-primary',
    batch: '#CR-7019',
    type: 'pos',
    typeLabel: 'POS Sale',
    typeIcon: 'shopping_cart_checkout',
    typeBadgeClass: 'bg-primary-fixed text-primary',
    qtyDelta: '-6 Units',
    qtyDeltaClass: 'text-primary font-bold text-[15px]',
    balanceAfter: '88 Units',
    balanceLocation: 'POS Shelf Rack 3',
    refNumber: 'POS-#9412',
    refClass: 'text-primary',
    refIcon: 'receipt',
    staffInitials: 'TM',
    staffName: 'Tariq Mehmood',
    staffRole: 'Lead Cashier',
    notes: 'Sold on seasonal credit terms (Khata ID: #KHT-902)',
    actionIcon: 'receipt_long',
    actionTitle: 'Print Invoice Duplicate',
  },
];

export const StockMovementPage: React.FC = () => {
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGodown, setSelectedGodown] = useState('all');
  const [selectedStaff, setSelectedStaff] = useState('all');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const filteredRows = AUDIT_ROWS.filter((row) => {
    // Tab filter
    if (filterType === 'grn' && row.type !== 'grn') return false;
    if (filterType === 'pos' && row.type !== 'pos') return false;
    if (filterType === 'adjustments' && row.type !== 'adjustment') return false;
    if (filterType === 'damage' && row.type !== 'damage') return false;
    if (filterType === 'returns' && row.type !== 'return') return false;

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matches =
        row.productName.toLowerCase().includes(q) ||
        row.batch.toLowerCase().includes(q) ||
        row.refNumber.toLowerCase().includes(q) ||
        row.staffName.toLowerCase().includes(q) ||
        row.notes.toLowerCase().includes(q);
      if (!matches) return false;
    }

    // Godown filter
    if (selectedGodown !== 'all') {
      if (selectedGodown === 'main' && !row.balanceLocation.includes('Godown A')) return false;
      if (selectedGodown === 'pos' && !row.balanceLocation.includes('POS')) return false;
      if (selectedGodown === 'cold' && !row.balanceLocation.includes('Vault')) return false;
    }

    // Staff filter
    if (selectedStaff !== 'all') {
      if (selectedStaff === 'khan' && !row.staffName.includes('Khan')) return false;
      if (selectedStaff === 'tariq' && !row.staffName.includes('Tariq')) return false;
      if (selectedStaff === 'asif' && !row.staffName.includes('Asif')) return false;
    }

    return true;
  });

  return (
    <div className="flex flex-col w-full">
      {/* Dynamic Audit Header Area */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-lg mb-space-xl">
        <div className="flex flex-col gap-space-xs max-w-3xl">
          <div className="flex items-center gap-space-xs">
            <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-primary font-label-sm text-label-sm font-semibold uppercase tracking-wider">
              Inventory Security &amp; Compliance
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-outline-variant"></span>
            <span className="font-label-sm text-label-sm text-outline">Immutable Audit Ledger</span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
            Stock Movement &amp; Audit Trail
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Complete ledger and historical audit log of every agricultural stock intake, POS sale, batch transfer, damage write-off, and customer return.
          </p>
        </div>

        {/* Secondary Action Utility Group */}
        <div className="flex items-center gap-space-sm shrink-0">
          <button
            className="h-10 px-space-md rounded-xl bg-surface-container-lowest text-on-surface shadow-sm hover:bg-surface-container-low transition-all duration-200 flex items-center gap-2 group cursor-pointer"
            onClick={() => alert('Preparing stock ledger print spooler...')}
            type="button"
          >
            <span className="material-symbols-outlined text-[18px] text-outline group-hover:text-primary transition-colors">
              print
            </span>
            <span className="font-label-md text-label-md">Print Ledger</span>
          </button>

          <div className="relative">
            <button
              className="h-10 px-space-md rounded-xl bg-primary text-on-primary shadow-sm hover:bg-primary-container transition-all duration-200 flex items-center gap-2 cursor-pointer"
              id="exportDropdownBtn"
              onClick={() => setExportMenuOpen(!exportMenuOpen)}
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">file_download</span>
              <span className="font-label-md text-label-md">Export Audit Report</span>
              <span className="material-symbols-outlined text-[16px]">arrow_drop_down</span>
            </button>

            {exportMenuOpen && (
              <div
                className="absolute right-0 mt-2 w-52 rounded-xl bg-surface-container-lowest shadow-xl z-30 py-1.5 border border-surface-container-low"
                id="exportDropdownMenu"
              >
                <button
                  className="w-full text-left flex items-center gap-2.5 px-space-md py-2 font-body-sm text-body-sm text-on-surface hover:bg-surface-container-low transition-colors cursor-pointer"
                  onClick={() => {
                    setExportMenuOpen(false);
                    alert('Exporting PDF audit report...');
                  }}
                  type="button"
                >
                  <span className="material-symbols-outlined text-error text-[18px]">picture_as_pdf</span>
                  <span>Export Official PDF (.pdf)</span>
                </button>
                <button
                  className="w-full text-left flex items-center gap-2.5 px-space-md py-2 font-body-sm text-body-sm text-on-surface hover:bg-surface-container-low transition-colors cursor-pointer"
                  onClick={() => {
                    setExportMenuOpen(false);
                    alert('Exporting Excel sheet...');
                  }}
                  type="button"
                >
                  <span className="material-symbols-outlined text-secondary text-[18px]">table_view</span>
                  <span>Export Excel Sheet (.xlsx)</span>
                </button>
                <button
                  className="w-full text-left flex items-center gap-2.5 px-space-md py-2 font-body-sm text-body-sm text-on-surface hover:bg-surface-container-low transition-colors cursor-pointer"
                  onClick={() => {
                    setExportMenuOpen(false);
                    alert('Exporting raw CSV log...');
                  }}
                  type="button"
                >
                  <span className="material-symbols-outlined text-outline text-[18px]">terminal</span>
                  <span>Export Raw Audit Log (.csv)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top KPI Metrics Bar (4 bespoke Cards with inline micro-visuals) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-space-lg mb-space-xl">
        {/* Card 1: Inward Stock */}
        <div className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-secondary/5 group-hover:scale-125 transition-transform duration-500 pointer-events-none"></div>
          <div className="flex items-start justify-between mb-space-sm">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
              Inward Stock (This Month)
            </span>
            <span className="p-1.5 rounded-lg bg-surface-container-high text-secondary flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">call_received</span>
            </span>
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-currency-stat text-currency-stat text-on-surface tracking-tight">+4,820</span>
            <span className="font-label-md text-label-md text-secondary font-bold">Units</span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="font-currency-cell text-currency-cell text-outline">Rs. 6,850,000 Total</span>
            <span className="inline-flex items-center gap-1 font-label-sm text-label-sm text-secondary bg-surface-container-high px-2 py-0.5 rounded-full font-semibold">
              <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
              <span>+14.8%</span>
            </span>
          </div>
          <div className="mt-3 flex items-end gap-1 h-3.5 w-full">
            <div className="h-1.5 w-full bg-secondary/20 rounded-t-sm"></div>
            <div className="h-2 w-full bg-secondary/30 rounded-t-sm"></div>
            <div className="h-2.5 w-full bg-secondary/40 rounded-t-sm"></div>
            <div className="h-3 w-full bg-secondary/60 rounded-t-sm"></div>
            <div className="h-3.5 w-full bg-secondary rounded-t-sm"></div>
          </div>
        </div>

        {/* Card 2: Outward POS Sales */}
        <div className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-primary/5 group-hover:scale-125 transition-transform duration-500 pointer-events-none"></div>
          <div className="flex items-start justify-between mb-space-sm">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Outward POS Sales</span>
            <span className="p-1.5 rounded-lg bg-surface-container-high text-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">point_of_sale</span>
            </span>
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-currency-stat text-currency-stat text-on-surface tracking-tight">-3,210</span>
            <span className="font-label-md text-label-md text-primary font-bold">Units</span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="font-currency-cell text-currency-cell text-outline">Rs. 8,940,200 Gross</span>
            <span className="inline-flex items-center gap-1 font-label-sm text-label-sm text-primary bg-surface-container-high px-2 py-0.5 rounded-full font-semibold">
              <span className="material-symbols-outlined text-[14px]">arrow_downward</span>
              <span>Peak Rabi Sale</span>
            </span>
          </div>
          <div className="mt-3 flex items-end gap-1 h-3.5 w-full">
            <div className="h-2 w-full bg-primary/30 rounded-t-sm"></div>
            <div className="h-3 w-full bg-primary/50 rounded-t-sm"></div>
            <div className="h-2.5 w-full bg-primary/40 rounded-t-sm"></div>
            <div className="h-3.5 w-full bg-primary rounded-t-sm"></div>
            <div className="h-3 w-full bg-primary/70 rounded-t-sm"></div>
          </div>
        </div>

        {/* Card 3: Adjustments & Returns */}
        <div className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-surface-container-high group-hover:scale-125 transition-transform duration-500 pointer-events-none"></div>
          <div className="flex items-start justify-between mb-space-sm">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
              Adjustments &amp; Returns
            </span>
            <span className="p-1.5 rounded-lg bg-surface-container text-on-surface flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">sync_alt</span>
            </span>
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-currency-stat text-currency-stat text-on-surface tracking-tight">+64</span>
            <span className="font-label-md text-label-md text-on-surface-variant font-medium">Net Delta</span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="font-currency-cell text-currency-cell text-outline">Reconciled Batch Log</span>
            <span className="inline-flex items-center gap-1 font-label-sm text-label-sm text-on-surface bg-surface-container px-2 py-0.5 rounded-full font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
              <span>Balanced</span>
            </span>
          </div>
          <div className="mt-3 w-full bg-surface-container-low h-1.5 rounded-full overflow-hidden">
            <div className="bg-primary h-full w-[78%] rounded-full"></div>
          </div>
        </div>

        {/* Card 4: Damaged / Expired Write-offs */}
        <div className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-error/5 group-hover:scale-125 transition-transform duration-500 pointer-events-none"></div>
          <div className="flex items-start justify-between mb-space-sm">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Damaged / Expired</span>
            <span className="p-1.5 rounded-lg bg-error-container text-on-error-container flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">warning</span>
            </span>
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-currency-stat text-currency-stat text-error tracking-tight">-18</span>
            <span className="font-label-md text-label-md text-error font-bold">Units</span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="font-currency-cell text-currency-cell text-outline">Rs. 28,400 Loss</span>
            <span className="inline-flex items-center gap-1 font-label-sm text-label-sm text-on-error-container bg-error-container px-2 py-0.5 rounded-full font-semibold">
              <span className="material-symbols-outlined text-[14px]">report_problem</span>
              <span>0.19% Write-off</span>
            </span>
          </div>
          <div className="mt-3 w-full bg-error-container h-1.5 rounded-full overflow-hidden">
            <div className="bg-error h-full w-[12%] rounded-full"></div>
          </div>
        </div>
      </div>

      {/* Operational Filter Matrix and Toolbar */}
      <div className="flex flex-col gap-space-md mb-space-lg bg-surface-container-lowest p-space-md rounded-xl shadow-sm">
        {/* Row 1: Quick Movement Tabs & Timeframe Selection */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-space-md pb-space-sm">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 xl:pb-0 scrollbar-none" id="movementFilterGroup">
            <button
              className={`px-3.5 py-1.5 rounded-lg font-label-md text-label-md whitespace-nowrap transition-colors cursor-pointer ${
                filterType === 'all'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
              onClick={() => setFilterType('all')}
              type="button"
            >
              All Movements (4,120)
            </button>
            <button
              className={`px-3.5 py-1.5 rounded-lg font-label-md text-label-md whitespace-nowrap transition-colors cursor-pointer ${
                filterType === 'grn'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
              onClick={() => setFilterType('grn')}
              type="button"
            >
              <span className="text-secondary font-bold mr-1">+</span> Purchases / GRN (312)
            </button>
            <button
              className={`px-3.5 py-1.5 rounded-lg font-label-md text-label-md whitespace-nowrap transition-colors cursor-pointer ${
                filterType === 'pos'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
              onClick={() => setFilterType('pos')}
              type="button"
            >
              <span className="text-primary font-bold mr-1">-</span> POS Sales (3,640)
            </button>
            <button
              className={`px-3.5 py-1.5 rounded-lg font-label-md text-label-md whitespace-nowrap transition-colors cursor-pointer ${
                filterType === 'adjustments'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
              onClick={() => setFilterType('adjustments')}
              type="button"
            >
              Adjustments (+/- 86)
            </button>
            <button
              className={`px-3.5 py-1.5 rounded-lg font-label-md text-label-md whitespace-nowrap transition-colors cursor-pointer ${
                filterType === 'damage'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
              onClick={() => setFilterType('damage')}
              type="button"
            >
              <span className="text-error font-bold mr-1">!</span> Damaged / Expired (18)
            </button>
            <button
              className={`px-3.5 py-1.5 rounded-lg font-label-md text-label-md whitespace-nowrap transition-colors cursor-pointer ${
                filterType === 'returns'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
              onClick={() => setFilterType('returns')}
              type="button"
            >
              Customer Returns (64)
            </button>
          </div>

          {/* Date Range Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="inline-flex rounded-lg bg-surface-container-high p-0.5">
              <button className="px-2.5 py-1 text-on-surface-variant font-label-sm text-label-sm hover:text-on-surface rounded-md transition-colors cursor-pointer">
                Today
              </button>
              <button className="px-2.5 py-1 text-on-surface-variant font-label-sm text-label-sm hover:text-on-surface rounded-md transition-colors cursor-pointer">
                Last 7D
              </button>
              <button className="px-2.5 py-1 bg-surface-container-lowest text-primary font-label-sm text-label-sm rounded-md shadow-sm font-semibold cursor-pointer">
                This Month
              </button>
              <button className="px-2.5 py-1 text-on-surface-variant font-label-sm text-label-sm hover:text-on-surface rounded-md transition-colors cursor-pointer">
                Rabi 2024
              </button>
            </div>
            <button className="h-[34px] px-2.5 rounded-lg bg-surface-container text-on-surface font-label-sm text-label-sm flex items-center gap-1.5 hover:bg-surface-container-high transition-colors cursor-pointer">
              <span className="material-symbols-outlined text-[16px] text-outline">calendar_month</span>
              <span>14 Oct 2024 - Today</span>
            </button>
          </div>
        </div>

        {/* Row 2: Search Input & Granular Dropdowns */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-space-sm pt-space-xs">
          <div className="md:col-span-6 relative">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-outline text-[18px]">
              search
            </span>
            <input
              className="w-full h-10 pl-10 pr-4 rounded-lg bg-surface font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest transition-colors shadow-inner"
              id="ledgerSearchInput"
              placeholder="Search invoice #, batch #, formulation, staff, or chemical name..."
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="md:col-span-3">
            <div className="relative">
              <select
                className="w-full h-10 px-3 pl-9 rounded-lg bg-surface font-body-sm text-body-sm text-on-surface focus:outline-none cursor-pointer appearance-none shadow-inner"
                id="godownFilterSelect"
                value={selectedGodown}
                onChange={(e) => setSelectedGodown(e.target.value)}
              >
                <option value="all">All Godowns &amp; Counters (Consolidated)</option>
                <option value="main">Main Godown A (Warehouse Hub)</option>
                <option value="pos">Front Shop POS Counter Racks</option>
                <option value="cold">Godown B (Pesticide Vault)</option>
              </select>
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px] pointer-events-none">
                warehouse
              </span>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline text-[18px] pointer-events-none">
                expand_more
              </span>
            </div>
          </div>

          <div className="md:col-span-3 flex items-center gap-2">
            <div className="relative w-full">
              <select
                className="w-full h-10 px-3 pl-9 rounded-lg bg-surface font-body-sm text-body-sm text-on-surface focus:outline-none cursor-pointer appearance-none shadow-inner"
                id="userFilterSelect"
                value={selectedStaff}
                onChange={(e) => setSelectedStaff(e.target.value)}
              >
                <option value="all">All Responsible Staff</option>
                <option value="khan">Muhammad Khan (Shop Owner)</option>
                <option value="tariq">Tariq Mehmood (Senior Cashier)</option>
                <option value="asif">Asif Ali (Inventory Supervisor)</option>
              </select>
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px] pointer-events-none">
                badge
              </span>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline text-[18px] pointer-events-none">
                expand_more
              </span>
            </div>
            <button
              className="h-10 w-10 shrink-0 rounded-lg bg-surface hover:bg-surface-container flex items-center justify-center text-outline hover:text-on-surface transition-colors cursor-pointer"
              onClick={() => {
                setSearchQuery('');
                setSelectedGodown('all');
                setSelectedStaff('all');
              }}
              title="Reset Filters"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">restart_alt</span>
            </button>
          </div>
        </div>
      </div>

      {/* Primary Stock Audit Ledger Table View */}
      <div className="w-full bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden mb-space-lg">
        {/* Table Container Header */}
        <div className="px-space-lg py-space-sm bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-headline-sm text-headline-sm text-on-surface">Live Ledger Entries</span>
            <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-primary font-label-sm text-label-sm font-bold">
              {filteredRows.length} Records Loaded
            </span>
          </div>
          <div className="flex items-center gap-space-md text-outline font-label-sm text-label-sm">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-secondary"></span> Live FIFO Synced
            </span>
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px]">verified_user</span> Integrity Verified
            </span>
          </div>
        </div>

        {/* Responsive Table Wrapper */}
        <div className="overflow-x-auto">
          <table className="w-full text-left" id="auditLedgerTable">
            <thead>
              <tr className="bg-surface font-label-sm text-label-sm text-outline uppercase tracking-wider select-none">
                <th className="py-3 px-space-md">Date &amp; Timestamp</th>
                <th className="py-3 px-space-md">Product &amp; Formulation</th>
                <th className="py-3 px-space-md">Batch / Lot #</th>
                <th className="py-3 px-space-md">Movement Type</th>
                <th className="py-3 px-space-md text-right">Quantity Delta</th>
                <th className="py-3 px-space-md text-right">Balance After</th>
                <th className="py-3 px-space-md">Reference #</th>
                <th className="py-3 px-space-md">Performed By</th>
                <th className="py-3 px-space-md">Audit Notes &amp; Rationale</th>
                <th className="py-3 px-space-sm text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-low font-body-md text-body-md text-on-surface">
              {filteredRows.map((row) => (
                <tr key={row.id} className="hover:bg-surface-container-low/60 transition-colors group">
                  <td className="py-3.5 px-space-md whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="font-label-md text-label-md font-semibold text-on-surface">{row.date}</span>
                      <span className="font-label-sm text-label-sm text-outline">{row.time}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-space-md">
                    <div className="flex items-center gap-space-sm min-w-[200px]">
                      <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
                        <span className={`material-symbols-outlined text-[20px] ${row.iconColor}`}>{row.icon}</span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-label-md text-label-md font-semibold text-on-surface truncate">
                          {row.productName}
                        </span>
                        <span className="font-label-sm text-label-sm text-outline truncate">{row.productDesc}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-space-md whitespace-nowrap">
                    <span className="px-2 py-1 rounded bg-surface-container font-currency-cell text-currency-cell text-on-surface-variant font-mono">
                      {row.batch}
                    </span>
                  </td>
                  <td className="py-3.5 px-space-md whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-label-sm text-label-sm font-semibold ${row.typeBadgeClass}`}
                    >
                      <span className="material-symbols-outlined text-[14px]">{row.typeIcon}</span>
                      <span>{row.typeLabel}</span>
                    </span>
                  </td>
                  <td className="py-3.5 px-space-md whitespace-nowrap text-right">
                    <span className={`font-currency-cell text-currency-cell ${row.qtyDeltaClass}`}>{row.qtyDelta}</span>
                  </td>
                  <td className="py-3.5 px-space-md whitespace-nowrap text-right">
                    <span className="font-currency-cell text-currency-cell text-on-surface font-semibold">
                      {row.balanceAfter}
                    </span>
                    <span className="block font-label-sm text-label-sm text-outline">{row.balanceLocation}</span>
                  </td>
                  <td className="py-3.5 px-space-md whitespace-nowrap">
                    <a
                      className={`inline-flex items-center gap-1 font-label-md text-label-md hover:underline font-medium ${row.refClass}`}
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        alert(`Opening Reference document: ${row.refNumber}`);
                      }}
                    >
                      <span>{row.refNumber}</span>
                      <span className="material-symbols-outlined text-[14px]">{row.refIcon}</span>
                    </a>
                  </td>
                  <td className="py-3.5 px-space-md whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-label-sm text-label-sm font-bold">
                        {row.staffInitials}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-label-sm text-label-sm font-semibold text-on-surface">{row.staffName}</span>
                        <span className="font-label-sm text-label-sm text-outline">{row.staffRole}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-space-md max-w-xs">
                    <span className="text-on-surface-variant line-clamp-1 text-ellipsis font-body-sm text-body-sm" title={row.notes}>
                      {row.notes}
                    </span>
                  </td>
                  <td className="py-3.5 px-space-sm text-center whitespace-nowrap">
                    <button
                      className="p-1.5 rounded-lg text-outline hover:text-primary hover:bg-surface-container-high transition-colors cursor-pointer"
                      title={row.actionTitle}
                      type="button"
                      onClick={() => alert(`${row.actionTitle} for ${row.refNumber}`)}
                    >
                      <span className="material-symbols-outlined text-[18px]">{row.actionIcon}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Ledger Table Pagination & Batch Sync Status */}
        <div className="px-space-lg py-space-sm bg-surface-container-low flex flex-col md:flex-row items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-sm">
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              Showing <span className="font-semibold text-on-surface">1 - {filteredRows.length}</span> of{' '}
              <span className="font-semibold text-on-surface">4,120</span> recorded movements
            </span>
            <div className="h-4 w-px bg-outline-variant hidden sm:block"></div>
            <div className="hidden sm:flex items-center gap-1.5 font-label-sm text-label-sm text-outline">
              <span className="material-symbols-outlined text-[16px] text-secondary">database</span>
              <span>Ledger Checksum: 0x9AF83B • Valid</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              className="px-3 py-1.5 rounded-lg bg-surface-container-lowest text-outline hover:text-on-surface font-label-md text-label-md shadow-sm disabled:opacity-50 cursor-pointer"
              disabled
              type="button"
            >
              Previous
            </button>
            <button className="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-label-md text-label-md font-semibold shadow-sm cursor-pointer" type="button">
              1
            </button>
            <button className="px-3 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container-high font-label-md text-label-md transition-colors cursor-pointer" type="button">
              2
            </button>
            <button className="px-3 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container-high font-label-md text-label-md transition-colors cursor-pointer" type="button">
              3
            </button>
            <span className="px-1.5 font-body-sm text-body-sm text-outline">...</span>
            <button className="px-3 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container-high font-label-md text-label-md transition-colors cursor-pointer" type="button">
              589
            </button>
            <button className="px-3 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container-high font-label-md text-label-md shadow-sm transition-colors cursor-pointer" type="button">
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Deep Context Visual Row: Godown Spatial Distribution & Batch Reconciliation Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-lg">
        {/* Storage Godown Activity Breakdown */}
        <div className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-space-sm">
              <span className="font-headline-sm text-headline-sm text-on-surface">Godown Storage Turnover</span>
              <span className="material-symbols-outlined text-outline text-[20px]">warehouse</span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
              Real-time distribution of physical chemical and fertilizer movements across registered storage spaces.
            </p>
            <div className="space-y-space-sm">
              <div>
                <div className="flex justify-between font-label-sm text-label-sm mb-1">
                  <span className="text-on-surface font-semibold">Main Godown A (Hub)</span>
                  <span className="text-primary font-bold">58% Total Intake</span>
                </div>
                <div className="h-2 w-full bg-surface-container-high rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: '58%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between font-label-sm text-label-sm mb-1">
                  <span className="text-on-surface font-semibold">Front Shop POS Racks</span>
                  <span className="text-secondary font-bold">32% POS Outward</span>
                </div>
                <div className="h-2 w-full bg-surface-container-high rounded-full overflow-hidden">
                  <div className="h-full bg-secondary rounded-full" style={{ width: '32%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between font-label-sm text-label-sm mb-1">
                  <span className="text-on-surface font-semibold">Cold Pesticide Vault</span>
                  <span className="text-on-tertiary-container font-bold">10% Active Batches</span>
                </div>
                <div className="h-2 w-full bg-surface-container-high rounded-full overflow-hidden">
                  <div className="h-full bg-tertiary-container rounded-full" style={{ width: '10%' }}></div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-space-md pt-space-sm flex items-center justify-between text-outline font-label-sm text-label-sm">
            <span>Capacity: 28,000 units</span>
            <a className="text-primary font-semibold hover:underline" href="#">
              Manage Godowns →
            </a>
          </div>
        </div>

        {/* Active Batch Expiry & Audit Advisory */}
        <div className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-space-sm">
              <span className="font-headline-sm text-headline-sm text-on-surface">Batch Expiry Risk Audit</span>
              <span className="p-1 rounded bg-error-container text-on-error-container">
                <span className="material-symbols-outlined text-[16px]">priority_high</span>
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
              Batches nearing expiry within 90 days. Recommend prioritize FIFO outward dispatching immediately.
            </p>
            <div className="space-y-space-xs">
              <div className="p-2.5 rounded-lg bg-surface-container-low flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-error"></span>
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm font-bold text-on-surface">
                      Chlorpyrifos 40 EC (#CP-102)
                    </span>
                    <span className="font-body-sm text-body-sm text-outline">Expires in 18 Days • 14 Units</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded bg-error-container text-error font-label-sm text-label-sm font-bold">
                  Urgent Sale
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-surface-container-low flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-tertiary-fixed-dim"></span>
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm font-bold text-on-surface">
                      Lambda Cyhalothrin (#LM-94)
                    </span>
                    <span className="font-body-sm text-body-sm text-outline">Expires in 42 Days • 40 Units</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded bg-surface-container text-outline font-label-sm text-label-sm">
                  Promote
                </span>
              </div>
            </div>
          </div>
          <div className="mt-space-md pt-space-sm flex items-center justify-between text-outline font-label-sm text-label-sm">
            <span>Zero compromised lots</span>
            <a className="text-primary font-semibold hover:underline" href="#">
              Batch Inventory Ledger →
            </a>
          </div>
        </div>

        {/* Godown Visual Verification Camera / Store Status */}
        <div className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-space-sm">
              <span className="font-headline-sm text-headline-sm text-on-surface">Storehouse Integrity</span>
              <span className="flex items-center gap-1 font-label-sm text-label-sm text-secondary bg-surface-container-high px-2 py-0.5 rounded-full font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span> CCTV Active
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
              Visual reference photo of main pesticide aisle during today's physical stock count reconciliation.
            </p>
            <div className="w-full h-32 rounded-lg overflow-hidden relative shadow-inner">
              <img
                alt="Agricultural chemical warehouse interior with labeled pesticide bottles"
                className="w-full h-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCHrVAUbYIo__TtgEEat0KE-n26d-7bl4ggj1KQiQVzVsMu3P0L0mbvEuXKPlXGnWDoNcW08velGEsIRIRZ54GM6X5NIKXvzyUOmvCPRy5uGPyyw4XAdio62MB2Lqn57AFpi-RDqswFHqMQt6bvk_6r2ZAZcE8sp52bxGgBaUqnRXHSOMG0vKdMHlad4_WGQNQsUpvzpbIDgitBQXM9LphQiLpecdR-Ih1tagCNIZ2vFCGLtC1VWYjyCg"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-inverse-surface/80 via-transparent to-transparent flex items-end p-2.5">
                <span className="font-label-sm text-label-sm text-inverse-on-surface flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">videocam</span> Main Warehouse Aisle 04 • Cam #2
                </span>
              </div>
            </div>
          </div>
          <div className="mt-space-md pt-space-xs flex items-center justify-between text-outline font-label-sm text-label-sm">
            <span>Last physical inspection: 08:30 AM</span>
            <button
              className="text-primary font-semibold hover:underline cursor-pointer"
              onClick={() => alert('Audit stamp signed and appended by Shop Owner Muhammad Khan.')}
              type="button"
            >
              Sign Off Audit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockMovementPage;
