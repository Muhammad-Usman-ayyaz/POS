import React, { useState } from 'react';

interface InventoryItem {
  id: number;
  name: string;
  pack: string;
  company: string;
  batch: string;
  mfgDate: string;
  godown: string;
  shelf: string;
  stockQty: number;
  maxStock: number;
  stockUnit: string;
  stockLevelPct: number;
  stockNote: string;
  purchasePrice: number;
  salePrice: number;
  expiryDate: string;
  expiryBadge: string;
  expiryBadgeColor: string;
  status: 'In Stock' | 'Near Expiry' | 'Low Stock' | 'Quarantined';
  icon: string;
  iconBg: string;
  iconColor: string;
  rowBg?: string;
  isStrikethrough?: boolean;
}

const INVENTORY_ROWS: InventoryItem[] = [
  {
    id: 1,
    name: 'Coragen 20 SC',
    pack: '50ml Liquid',
    company: 'FMC Agro',
    batch: '#BAT-88219',
    mfgDate: '15 Oct 2023',
    godown: 'Main Mandi Depot',
    shelf: 'Rack B-04 / Shelf 2',
    stockQty: 185,
    maxStock: 240,
    stockUnit: 'Cans',
    stockLevelPct: 78,
    stockNote: 'Optimum (Max 240)',
    purchasePrice: 1450,
    salePrice: 1850,
    expiryDate: '14 Oct 2026',
    expiryBadge: '24 Mos Healthy',
    expiryBadgeColor: 'bg-[#ECFDF5] text-[#065F46]',
    status: 'In Stock',
    icon: 'bug_report',
    iconBg: 'bg-surface-container',
    iconColor: 'text-primary',
  },
  {
    id: 2,
    name: 'Belt Expert 480 SC',
    pack: '100ml Bottle',
    company: 'Bayer CropScience',
    batch: '#ENG-2024-99',
    mfgDate: '20 Nov 2022',
    godown: 'Farm Front Retail',
    shelf: 'Counter Rack A-01',
    stockQty: 34,
    maxStock: 140,
    stockUnit: 'Bottles',
    stockLevelPct: 25,
    stockNote: 'Expiring Rapidly',
    purchasePrice: 2100,
    salePrice: 2550,
    expiryDate: '18 Nov 2024',
    expiryBadge: '35 Days - Near Expiry',
    expiryBadgeColor: 'bg-[#FFFBEB] text-[#92400E]',
    status: 'Near Expiry',
    icon: 'pest_control_rodent',
    iconBg: 'bg-[#FEF3C7]',
    iconColor: 'text-[#92400E]',
    rowBg: 'bg-[#FFFDF9]',
  },
  {
    id: 3,
    name: 'Zorawar DAP Fertilizer',
    pack: '50kg Poly Bag',
    company: 'Engro Fertilizers',
    batch: '#ENG-FERT-402',
    mfgDate: '01 Jan 2024',
    godown: 'Godown #2 - Yard',
    shelf: 'Stack Bay 08',
    stockQty: 12,
    maxStock: 150,
    stockUnit: 'Bags',
    stockLevelPct: 8,
    stockNote: 'Min Threshold: 50',
    purchasePrice: 10850,
    salePrice: 11400,
    expiryDate: '31 Dec 2027',
    expiryBadge: 'Fresh Batch',
    expiryBadgeColor: 'bg-[#ECFDF5] text-[#065F46]',
    status: 'Low Stock',
    icon: 'agriculture',
    iconBg: 'bg-surface-container',
    iconColor: 'text-tertiary',
  },
  {
    id: 4,
    name: 'Amistar Top 325 SC',
    pack: '200ml Suspension',
    company: 'Syngenta Pak',
    batch: '#SYN-3341',
    mfgDate: '12 Mar 2024',
    godown: 'Godown #2 - Cold Chamber',
    shelf: 'Chamber C / Shelf 1',
    stockQty: 450,
    maxStock: 500,
    stockUnit: 'Bottles',
    stockLevelPct: 90,
    stockNote: 'High Stock Level',
    purchasePrice: 2820,
    salePrice: 3350,
    expiryDate: '11 Mar 2027',
    expiryBadge: '34 Mos Healthy',
    expiryBadgeColor: 'bg-[#ECFDF5] text-[#065F46]',
    status: 'In Stock',
    icon: 'eco',
    iconBg: 'bg-surface-container',
    iconColor: 'text-primary',
  },
  {
    id: 5,
    name: 'Target Glyphosate 48% SL',
    pack: '1L Canister',
    company: 'Ali Akbar Group',
    batch: '#AAG-GLY-902',
    mfgDate: '01 Sep 2021',
    godown: 'Quarantine Locker',
    shelf: 'Depot A-12 / Segregated',
    stockQty: 18,
    maxStock: 50,
    stockUnit: 'Cans',
    stockLevelPct: 100,
    stockNote: 'Locked from POS',
    purchasePrice: 1150,
    salePrice: 1450,
    expiryDate: '02 Sep 2024',
    expiryBadge: 'Expired (Write-off)',
    expiryBadgeColor: 'bg-[#FEF2F2] text-[#991B1B]',
    status: 'Quarantined',
    icon: 'dangerous',
    iconBg: 'bg-[#FEE2E2]',
    iconColor: 'text-error',
    rowBg: 'bg-[#FEF2F2]/40',
    isStrikethrough: true,
  },
  {
    id: 6,
    name: 'Confidor Ultra 200 SL',
    pack: '250ml Liquid',
    company: 'Bayer CropScience',
    batch: '#BAY-CF-112',
    mfgDate: '19 Feb 2024',
    godown: 'Main Mandi Depot',
    shelf: 'Rack B-09 / Shelf 4',
    stockQty: 94,
    maxStock: 160,
    stockUnit: 'Bottles',
    stockLevelPct: 60,
    stockNote: 'Adequate Supply',
    purchasePrice: 1750,
    salePrice: 2150,
    expiryDate: '18 Feb 2027',
    expiryBadge: '33 Mos Healthy',
    expiryBadgeColor: 'bg-[#ECFDF5] text-[#065F46]',
    status: 'In Stock',
    icon: 'spa',
    iconBg: 'bg-surface-container',
    iconColor: 'text-primary',
  },
  {
    id: 7,
    name: 'Karate 2.5 EC',
    pack: '1L Aluminium Can',
    company: 'Syngenta Pak',
    batch: '#SYN-KR-808',
    mfgDate: '05 Jun 2023',
    godown: 'Godown #2 - Chemical Bay',
    shelf: 'Rack K-02',
    stockQty: 8,
    maxStock: 60,
    stockUnit: 'Cans',
    stockLevelPct: 12,
    stockNote: 'Reorder Point: 25',
    purchasePrice: 2400,
    salePrice: 2900,
    expiryDate: '04 Jun 2026',
    expiryBadge: '20 Mos Healthy',
    expiryBadgeColor: 'bg-[#ECFDF5] text-[#065F46]',
    status: 'Low Stock',
    icon: 'pest_control',
    iconBg: 'bg-surface-container',
    iconColor: 'text-tertiary',
  },
  {
    id: 8,
    name: 'Sona Urea (Prilled)',
    pack: '50kg Bag (White)',
    company: 'FFC (Fauji Fert)',
    batch: '#FFC-2024-U7',
    mfgDate: '01 Aug 2024',
    godown: 'Main Mandi Depot',
    shelf: 'Godown Yard Central',
    stockQty: 620,
    maxStock: 750,
    stockUnit: 'Bags',
    stockLevelPct: 85,
    stockNote: 'Heavy Volume',
    purchasePrice: 4300,
    salePrice: 4650,
    expiryDate: '31 Jul 2028',
    expiryBadge: '47 Mos Healthy',
    expiryBadgeColor: 'bg-[#ECFDF5] text-[#065F46]',
    status: 'In Stock',
    icon: 'scatter_plot',
    iconBg: 'bg-surface-container',
    iconColor: 'text-primary',
  },
];

export const InventoryPage: React.FC = () => {
  const [items] = useState<InventoryItem[]>(INVENTORY_ROWS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Category: All');
  const [selectedGodown, setSelectedGodown] = useState('Godown: All Locations');
  const [selectedStatus, setSelectedStatus] = useState('Status: All Batches');
  const [selectedRows, setSelectedRows] = useState<number[]>([]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedRows(items.map((i) => i.id));
    } else {
      setSelectedRows([]);
    }
  };

  const handleSelectRow = (id: number) => {
    if (selectedRows.includes(id)) {
      setSelectedRows(selectedRows.filter((rId) => rId !== id));
    } else {
      setSelectedRows([...selectedRows, id]);
    }
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      searchQuery === '' ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.batch.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.shelf.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesGodown =
      selectedGodown === 'Godown: All Locations' ||
      item.godown.toLowerCase().includes(selectedGodown.replace('Godown: ', '').toLowerCase());

    const matchesStatus =
      selectedStatus === 'Status: All Batches' ||
      (selectedStatus.includes('Healthy') && item.status === 'In Stock') ||
      (selectedStatus.includes('Low Stock') && item.status === 'Low Stock') ||
      (selectedStatus.includes('Expiring') && item.status === 'Near Expiry') ||
      (selectedStatus.includes('Expired') && item.status === 'Quarantined');

    return matchesSearch && matchesGodown && matchesStatus;
  });

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('Category: All');
    setSelectedGodown('Godown: All Locations');
    setSelectedStatus('Status: All Batches');
  };

  return (
    <div className="flex flex-col w-full gap-y-space-xl">
      {/* Header Breadcrumb & Context Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
        <div className="flex flex-col">
          <div className="flex items-center gap-space-xs font-label-sm text-label-sm text-outline uppercase tracking-wider mb-1">
            <span>Inventory Hub</span>
            <span>/</span>
            <span className="text-primary font-semibold">Stock Reconciler</span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Inventory Management</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
            Manage warehouse stock, batch lifecycles, reorder levels, and expiration monitoring across godowns.
          </p>
        </div>
        <div className="flex items-center gap-space-sm flex-wrap">
          <button
            className="h-10 px-space-md rounded-lg bg-surface-container-lowest text-on-surface font-label-md text-label-md shadow-sm hover:bg-surface-container-low transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
            type="button"
            onClick={() => alert('Exporting Stock Sheet CSV...')}
          >
            <span className="material-symbols-outlined text-[18px] text-outline">file_download</span>
            <span>Export Stock Sheet</span>
          </button>
          <button
            className="h-10 px-space-md rounded-lg bg-surface-container-lowest text-on-surface font-label-md text-label-md shadow-sm hover:bg-surface-container-low transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
            type="button"
            onClick={() => alert('Bulk Batch Audit Report triggered')}
          >
            <span className="material-symbols-outlined text-[18px] text-primary">fact_check</span>
            <span>Bulk Batch Audit</span>
          </button>
          <button
            className="h-10 px-space-lg rounded-lg bg-primary text-on-primary font-label-md text-label-md shadow-sm hover:bg-primary-container transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
            type="button"
            onClick={() => alert('Stock Adjustment Window')}
          >
            <span className="material-symbols-outlined text-[18px]">tune</span>
            <span>+ Stock Adjustment</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid (5 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-space-md">
        {/* Card 1: Total SKUs */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute right-0 top-0 translate-x-2 -translate-y-2 opacity-5 pointer-events-none">
            <span className="material-symbols-outlined text-[88px] text-primary">inventory_2</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Total Products</span>
            <span className="p-1 rounded-full bg-surface-container text-primary">
              <span className="material-symbols-outlined text-[16px]">category</span>
            </span>
          </div>
          <div className="mt-space-sm">
            <div className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">
              248 <span className="font-label-md text-label-md text-outline font-normal">SKUs</span>
            </div>
            <div className="flex items-center gap-1 mt-1 font-label-sm text-label-sm text-secondary">
              <span className="material-symbols-outlined text-[14px]">check_circle</span>
              <span>Active in catalog</span>
            </div>
          </div>
        </div>

        {/* Card 2: Stock Valuation */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute right-0 top-0 translate-x-2 -translate-y-2 opacity-5 pointer-events-none">
            <span className="material-symbols-outlined text-[88px] text-primary">payments</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Stock Valuation</span>
            <span className="p-1 rounded-full bg-surface-container text-primary">
              <span className="material-symbols-outlined text-[16px]">account_balance_wallet</span>
            </span>
          </div>
          <div className="mt-space-sm">
            <div className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">Rs. 14.89M</div>
            <div className="flex items-center gap-1 mt-1 font-label-sm text-label-sm text-outline">
              <span className="material-symbols-outlined text-[14px]">warehouse</span>
              <span>3,420 physical units</span>
            </div>
          </div>
        </div>

        {/* Card 3: Low Stock Warning */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute right-0 top-0 translate-x-2 -translate-y-2 opacity-5 pointer-events-none">
            <span className="material-symbols-outlined text-[88px] text-tertiary">warning</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Low Stock</span>
            <span className="px-2 py-0.5 rounded-full bg-[#FFFBEB] text-[#92400E] font-label-sm text-label-sm font-semibold">
              14 Alert
            </span>
          </div>
          <div className="mt-space-sm">
            <div className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight text-tertiary">
              14 <span className="font-label-md text-label-md text-outline font-normal">Items</span>
            </div>
            <div className="flex items-center gap-1 mt-1 font-label-sm text-label-sm text-tertiary font-medium">
              <span className="material-symbols-outlined text-[14px]">shopping_cart_checkout</span>
              <span>Needs purchase order</span>
            </div>
          </div>
        </div>

        {/* Card 4: Near Expiry Warning */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute right-0 top-0 translate-x-2 -translate-y-2 opacity-5 pointer-events-none">
            <span className="material-symbols-outlined text-[88px] text-tertiary">schedule</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Near Expiry</span>
            <span className="px-2 py-0.5 rounded-full bg-[#FFFBEB] text-[#92400E] font-label-sm text-label-sm font-semibold">
              &lt; 90 Days
            </span>
          </div>
          <div className="mt-space-sm">
            <div className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">
              6 <span className="font-label-md text-label-md text-outline font-normal">Batches</span>
            </div>
            <div className="flex items-center gap-1 mt-1 font-label-sm text-label-sm text-[#92400E] font-medium">
              <span className="material-symbols-outlined text-[14px]">hourglass_bottom</span>
              <span>Liquidate priority</span>
            </div>
          </div>
        </div>

        {/* Card 5: Expired / Quarantine Critical */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute right-0 top-0 translate-x-2 -translate-y-2 opacity-5 pointer-events-none">
            <span className="material-symbols-outlined text-[88px] text-error">cancel</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Quarantine</span>
            <span className="px-2 py-0.5 rounded-full bg-[#FEF2F2] text-[#991B1B] font-label-sm text-label-sm font-semibold">
              Immediate
            </span>
          </div>
          <div className="mt-space-sm">
            <div className="font-headline-lg text-headline-lg text-error font-bold tracking-tight">
              2 <span className="font-label-md text-label-md text-outline font-normal">Batches</span>
            </div>
            <div className="flex items-center gap-1 mt-1 font-label-sm text-label-sm text-error font-medium">
              <span className="material-symbols-outlined text-[14px]">block</span>
              <span>Removal required</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Operation Controls Panel */}
      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-y-space-md">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-space-sm items-center">
          {/* Search */}
          <div className="md:col-span-5 relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">
              search
            </span>
            <input
              className="w-full h-10 pl-9 pr-3 rounded-lg bg-surface font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest transition-colors shadow-inner"
              id="tableFilterSearch"
              placeholder="Search by formulation, batch number, SKU, rack..."
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Category Filter */}
          <div className="md:col-span-2">
            <div className="relative">
              <select
                className="w-full h-10 pl-3 pr-8 rounded-lg bg-surface font-body-sm text-body-sm text-on-surface focus:outline-none appearance-none cursor-pointer"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option>Category: All</option>
                <option>Insecticide (Pesticide)</option>
                <option>Weedicide (Herbicide)</option>
                <option>Fungicide</option>
                <option>Fertilizer &amp; Micro</option>
              </select>
              <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-outline pointer-events-none text-[18px]">
                arrow_drop_down
              </span>
            </div>
          </div>

          {/* Warehouse Filter */}
          <div className="md:col-span-3">
            <div className="relative">
              <select
                className="w-full h-10 pl-3 pr-8 rounded-lg bg-surface font-body-sm text-body-sm text-on-surface focus:outline-none appearance-none cursor-pointer"
                value={selectedGodown}
                onChange={(e) => setSelectedGodown(e.target.value)}
              >
                <option>Godown: All Locations</option>
                <option>Main Mandi Depot (Hub A)</option>
                <option>Godown #2 - Cold Chamber</option>
                <option>Farm Front Retail POS</option>
              </select>
              <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-outline pointer-events-none text-[18px]">
                warehouse
              </span>
            </div>
          </div>

          {/* Expiry Status Filter */}
          <div className="md:col-span-2">
            <div className="relative">
              <select
                className="w-full h-10 pl-3 pr-8 rounded-lg bg-surface font-body-sm text-body-sm text-on-surface focus:outline-none appearance-none cursor-pointer"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                <option>Status: All Batches</option>
                <option>Healthy (&gt; 1 yr)</option>
                <option>Expiring Soon (&lt; 90d)</option>
                <option>Low Stock Triggered</option>
                <option>Expired / Quarantined</option>
              </select>
              <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-outline pointer-events-none text-[18px]">
                filter_list
              </span>
            </div>
          </div>
        </div>

        {/* Active Filters & Batch Selection Counter Ribbon */}
        <div className="flex items-center justify-between pt-space-xs text-outline font-label-sm text-label-sm border-t border-surface-container">
          <div className="flex items-center gap-space-sm flex-wrap">
            <span>Active Filters:</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-on-surface font-label-sm text-label-sm">
              Godown: {selectedGodown.replace('Godown: ', '')}
              <button className="hover:text-error cursor-pointer" onClick={() => setSelectedGodown('Godown: All Locations')} type="button">
                <span className="material-symbols-outlined text-[12px]">close</span>
              </button>
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-on-surface font-label-sm text-label-sm">
              Active Stock Items
            </span>
            <button className="text-primary hover:underline font-label-sm text-label-sm ml-1 cursor-pointer" onClick={resetFilters} type="button">
              Reset Filters
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-space-md">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-secondary"></span>
              <span className="text-on-surface-variant font-label-sm text-label-sm">Healthy: 228</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]"></span>
              <span className="text-on-surface-variant font-label-sm text-label-sm">Attention: 18</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-error"></span>
              <span className="text-on-surface-variant font-label-sm text-label-sm">Critical: 2</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Data Table Workspace */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low font-label-sm text-label-sm text-outline uppercase tracking-wider select-none">
                <th className="py-3 px-4 w-12 text-center">
                  <input
                    checked={selectedRows.length === items.length && items.length > 0}
                    onChange={handleSelectAll}
                    className="rounded w-4 h-4 text-primary focus:ring-0 cursor-pointer"
                    id="selectAllCheckbox"
                    type="checkbox"
                  />
                </th>
                <th className="py-3 px-4 min-w-[260px]">Product Formulation &amp; Pack</th>
                <th className="py-3 px-4 min-w-[130px]">Batch No.</th>
                <th className="py-3 px-4 min-w-[140px]">Godown / Rack</th>
                <th className="py-3 px-4 min-w-[160px] text-right">In-Stock Level</th>
                <th className="py-3 px-4 min-w-[110px] text-right">Purchase</th>
                <th className="py-3 px-4 min-w-[110px] text-right">Sale Price</th>
                <th className="py-3 px-4 min-w-[180px]">Batch Expiration</th>
                <th className="py-3 px-4 min-w-[120px]">Status</th>
                <th className="py-3 px-4 min-w-[110px] text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container text-body-md font-body-md text-on-surface">
              {filteredItems.map((row) => {
                const isSelected = selectedRows.includes(row.id);

                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-surface-bright transition-colors group ${row.rowBg || ''}`}
                  >
                    <td className="py-3.5 px-4 text-center">
                      <input
                        checked={isSelected}
                        onChange={() => handleSelectRow(row.id)}
                        className="rounded w-4 h-4 text-primary focus:ring-0 cursor-pointer"
                        type="checkbox"
                      />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-space-sm">
                        <div
                          className={`w-10 h-10 rounded-lg ${row.iconBg} flex items-center justify-center shrink-0`}
                        >
                          <span className={`material-symbols-outlined text-[20px] ${row.iconColor}`}>
                            {row.icon}
                          </span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span
                            className={`font-label-lg text-label-lg font-semibold truncate leading-snug ${
                              row.status === 'Quarantined' ? 'text-on-surface' : 'text-on-surface'
                            }`}
                          >
                            {row.name}
                          </span>
                          <div className="flex items-center gap-1.5 font-body-sm text-body-sm text-outline truncate">
                            <span>{row.pack}</span>
                            <span>•</span>
                            <span
                              className={`font-medium ${
                                row.status === 'Quarantined' ? 'text-error' : 'text-primary'
                              }`}
                            >
                              {row.company}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1 font-label-md text-label-md font-semibold font-mono text-on-surface">
                        <span className={row.status === 'Quarantined' ? 'text-error' : ''}>{row.batch}</span>
                      </div>
                      <span className="font-label-sm text-label-sm text-outline">Mfg: {row.mfgDate}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col">
                        <span
                          className={`font-label-md text-label-md font-medium ${
                            row.status === 'Quarantined' ? 'text-error' : 'text-on-surface'
                          }`}
                        >
                          {row.godown}
                        </span>
                        <span className="font-label-sm text-label-sm text-outline">{row.shelf}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex flex-col items-end">
                        <span
                          className={`font-currency-cell text-currency-cell ${
                            row.status === 'Low Stock'
                              ? 'text-tertiary font-bold'
                              : row.status === 'Quarantined'
                              ? 'text-error font-bold'
                              : 'text-on-surface'
                          }`}
                        >
                          {row.stockQty} {row.stockUnit}
                        </span>
                        <div className="w-24 h-1.5 bg-surface-container rounded-full overflow-hidden mt-1">
                          <div
                            className={`h-full rounded-full ${
                              row.status === 'Low Stock'
                                ? 'bg-error'
                                : row.status === 'Near Expiry'
                                ? 'bg-[#F59E0B]'
                                : row.status === 'Quarantined'
                                ? 'bg-error'
                                : 'bg-secondary'
                            }`}
                            style={{ width: `${row.stockLevelPct}%` }}
                          ></div>
                        </div>
                        <span
                          className={`font-label-sm text-label-sm mt-0.5 ${
                            row.status === 'Low Stock' || row.status === 'Quarantined'
                              ? 'text-error font-medium'
                              : row.status === 'Near Expiry'
                              ? 'text-[#92400E]'
                              : 'text-outline'
                          }`}
                        >
                          {row.stockNote}
                        </span>
                      </div>
                    </td>
                    <td
                      className={`py-3.5 px-4 text-right font-currency-cell text-currency-cell text-outline ${
                        row.isStrikethrough ? 'line-through' : ''
                      }`}
                    >
                      Rs. {row.purchasePrice.toLocaleString()}
                    </td>
                    <td
                      className={`py-3.5 px-4 text-right font-currency-cell text-currency-cell font-semibold ${
                        row.isStrikethrough ? 'text-error line-through' : 'text-on-surface'
                      }`}
                    >
                      Rs. {row.salePrice.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`font-label-md text-label-md font-medium ${
                            row.status === 'Near Expiry'
                              ? 'text-[#92400E]'
                              : row.status === 'Quarantined'
                              ? 'text-error font-semibold'
                              : 'text-on-surface'
                          }`}
                        >
                          {row.expiryDate}
                        </span>
                        <span
                          className={`inline-flex w-fit items-center gap-1 px-2 py-0.5 rounded-full font-label-sm text-label-sm ${
                            row.expiryBadgeColor
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              row.status === 'In Stock'
                                ? 'bg-[#065F46]'
                                : row.status === 'Near Expiry'
                                ? 'bg-[#F59E0B]'
                                : 'bg-error'
                            }`}
                          ></span>
                          {row.expiryBadge}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full font-label-sm text-label-sm font-semibold ${
                          row.status === 'In Stock'
                            ? 'bg-[#ECFDF5] text-[#065F46]'
                            : row.status === 'Near Expiry'
                            ? 'bg-[#FFFBEB] text-[#92400E]'
                            : row.status === 'Low Stock'
                            ? 'bg-[#FFFBEB] text-[#92400E]'
                            : 'bg-[#FEF2F2] text-[#991B1B]'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {row.status === 'Quarantined' ? (
                          <>
                            <button
                              className="p-1.5 rounded-lg bg-[#FEE2E2] text-error hover:bg-error hover:text-white transition-colors cursor-pointer"
                              title="Write-Off Disposal Sheet"
                              type="button"
                              onClick={() => alert(`Write-off sheet for ${row.name}`)}
                            >
                              <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                            </button>
                            <button
                              className="p-1.5 rounded-lg hover:bg-surface-container text-outline hover:text-primary transition-colors cursor-pointer"
                              title="View Audit Trail"
                              type="button"
                            >
                              <span className="material-symbols-outlined text-[18px]">history</span>
                            </button>
                          </>
                        ) : row.status === 'Near Expiry' ? (
                          <>
                            <button
                              className="p-1.5 rounded-lg bg-surface-container text-[#92400E] hover:bg-[#FEF3C7] transition-colors cursor-pointer"
                              title="Liquidate Deal"
                              type="button"
                              onClick={() => alert(`Liquidate promotional deal for ${row.name}`)}
                            >
                              <span className="material-symbols-outlined text-[18px]">high_res</span>
                            </button>
                            <button
                              className="p-1.5 rounded-lg hover:bg-surface-container text-outline hover:text-primary transition-colors cursor-pointer"
                              title="Stock Adjustment"
                              type="button"
                            >
                              <span className="material-symbols-outlined text-[18px]">edit_note</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="p-1.5 rounded-lg hover:bg-surface-container text-outline hover:text-primary transition-colors cursor-pointer"
                              title="Quick View"
                              type="button"
                            >
                              <span className="material-symbols-outlined text-[18px]">visibility</span>
                            </button>
                            <button
                              className="p-1.5 rounded-lg hover:bg-surface-container text-outline hover:text-primary transition-colors cursor-pointer"
                              title="Stock Adjustment"
                              type="button"
                            >
                              <span className="material-symbols-outlined text-[18px]">edit_note</span>
                            </button>
                            <button
                              className="p-1.5 rounded-lg hover:bg-surface-container text-outline hover:text-primary transition-colors cursor-pointer"
                              title="Ledger Audit"
                              type="button"
                            >
                              <span className="material-symbols-outlined text-[18px]">history</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Table Bottom Bar */}
        <div className="p-space-md bg-surface-container-low flex flex-col md:flex-row md:items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-md flex-wrap font-label-sm text-label-sm text-on-surface-variant">
            <span className="font-medium text-on-surface">Showing 1 to {filteredItems.length} of 248 products</span>
            <div className="flex items-center gap-1.5">
              <span>Items per page:</span>
              <select className="h-8 px-2 rounded-lg bg-surface-container-lowest border-0 font-label-sm text-label-sm text-on-surface focus:outline-none cursor-pointer shadow-sm">
                <option>10</option>
                <option>25</option>
                <option>50</option>
                <option>100</option>
              </select>
            </div>
            <div className="hidden xl:flex items-center gap-2 pl-space-sm border-l border-surface-container">
              <span className="inline-block w-2 h-2 rounded-full bg-secondary"></span>
              <span className="text-outline">
                Inventory Valuation Method: <strong className="text-on-surface font-semibold">FIFO (First-In, First-Out)</strong>
              </span>
              <span className="text-outline">•</span>
              <span className="text-outline">
                Last Godown Sync: <strong className="text-on-surface font-semibold">12 mins ago</strong>
              </span>
            </div>
          </div>

          {/* Pagination Buttons */}
          <div className="flex items-center gap-1">
            <button
              className="h-8 w-8 rounded-lg bg-surface-container-lowest text-outline hover:text-on-surface hover:bg-surface-container shadow-sm flex items-center justify-center transition-colors cursor-pointer"
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">chevron_left</span>
            </button>
            <button
              className="h-8 w-8 rounded-lg bg-primary text-on-primary font-label-sm text-label-sm font-semibold shadow-sm flex items-center justify-center"
              type="button"
            >
              1
            </button>
            <button
              className="h-8 w-8 rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container shadow-sm font-label-sm text-label-sm flex items-center justify-center transition-colors cursor-pointer"
              type="button"
            >
              2
            </button>
            <button
              className="h-8 w-8 rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container shadow-sm font-label-sm text-label-sm flex items-center justify-center transition-colors cursor-pointer"
              type="button"
            >
              3
            </button>
            <span className="px-1 text-outline font-label-sm">...</span>
            <button
              className="h-8 w-8 rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container shadow-sm font-label-sm text-label-sm flex items-center justify-center transition-colors cursor-pointer"
              type="button"
            >
              25
            </button>
            <button
              className="h-8 w-8 rounded-lg bg-surface-container-lowest text-outline hover:text-on-surface hover:bg-surface-container shadow-sm flex items-center justify-center transition-colors cursor-pointer"
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      {/* Operational Insights Bento Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-md">
        {/* Godown Capacity & Occupancy Breakdown */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-space-sm">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Godown Storage Quota</h2>
              <span className="material-symbols-outlined text-outline text-[20px]">warehouse</span>
            </div>
            <p className="font-body-sm text-body-sm text-outline mb-space-md">
              Total physical volume occupied across retail warehouses.
            </p>
            <div className="flex flex-col gap-space-md">
              {/* Depot 1 */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between font-label-sm text-label-sm">
                  <span className="font-semibold text-on-surface">Main Mandi Depot (Hub A)</span>
                  <span className="text-outline">82% Cap (2,100 / 2,500 Units)</span>
                </div>
                <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: '82%' }}></div>
                </div>
              </div>
              {/* Depot 2 */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between font-label-sm text-label-sm">
                  <span className="font-semibold text-on-surface">Godown #2 - Cold Chamber</span>
                  <span className="text-outline">54% Cap (810 / 1,500 Units)</span>
                </div>
                <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                  <div className="h-full bg-secondary rounded-full" style={{ width: '54%' }}></div>
                </div>
              </div>
              {/* Depot 3 */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between font-label-sm text-label-sm">
                  <span className="font-semibold text-on-surface">Farm Front Retail Outlet</span>
                  <span className="text-outline">91% Cap (510 / 560 Units)</span>
                </div>
                <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                  <div className="h-full bg-[#F59E0B] rounded-full" style={{ width: '91%' }}></div>
                </div>
              </div>
            </div>
          </div>
          <div className="pt-space-md mt-space-md border-t border-surface-container flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-outline">Combined Capacity: 3,420 / 4,560</span>
            <button
              className="font-label-sm text-label-sm text-primary font-semibold hover:underline flex items-center gap-1 cursor-pointer"
              type="button"
              onClick={() => alert('Stock relocation workflow')}
            >
              <span>Relocate Stock</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          </div>
        </div>

        {/* Rapid Stock Reorder Priority Checklist */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-space-sm">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Urgent Purchase Reorders</h2>
              <span className="px-2 py-0.5 rounded-full bg-[#FFFBEB] text-[#92400E] font-label-sm text-label-sm font-semibold">
                3 Top Triggers
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-outline mb-space-md">Chemicals below safety buffer threshold.</p>
            <div className="divide-y divide-surface-container">
              <div className="py-2.5 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md font-semibold text-on-surface">Karate 2.5 EC (1L)</span>
                  <span className="font-label-sm text-label-sm text-error font-medium">8 Cans remaining (Min 25)</span>
                </div>
                <button
                  className="h-8 px-2.5 rounded-lg bg-surface-container text-primary font-label-sm text-label-sm font-semibold hover:bg-surface-container-high transition-colors cursor-pointer"
                  type="button"
                  onClick={() => alert('Creating Draft PO for Karate 2.5 EC')}
                >
                  PO Draft
                </button>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md font-semibold text-on-surface">Zorawar DAP (50kg)</span>
                  <span className="font-label-sm text-label-sm text-error font-medium">12 Bags remaining (Min 50)</span>
                </div>
                <button
                  className="h-8 px-2.5 rounded-lg bg-surface-container text-primary font-label-sm text-label-sm font-semibold hover:bg-surface-container-high transition-colors cursor-pointer"
                  type="button"
                  onClick={() => alert('Creating Draft PO for Zorawar DAP')}
                >
                  PO Draft
                </button>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md font-semibold text-on-surface">Nativo 75 WG (100g)</span>
                  <span className="font-label-sm text-label-sm text-[#92400E] font-medium">5 Packets remaining (Min 20)</span>
                </div>
                <button
                  className="h-8 px-2.5 rounded-lg bg-surface-container text-primary font-label-sm text-label-sm font-semibold hover:bg-surface-container-high transition-colors cursor-pointer"
                  type="button"
                  onClick={() => alert('Creating Draft PO for Nativo 75 WG')}
                >
                  PO Draft
                </button>
              </div>
            </div>
          </div>
          <div className="pt-space-md mt-space-md border-t border-surface-container">
            <button
              className="w-full h-9 rounded-lg bg-primary-container text-on-primary font-label-md text-label-md font-semibold hover:opacity-95 transition-opacity flex items-center justify-center gap-1.5 cursor-pointer"
              type="button"
              onClick={() => alert('Unified Purchase Order created')}
            >
              <span className="material-symbols-outlined text-[16px]">receipt_long</span>
              <span>Generate Unified Purchase Order</span>
            </button>
          </div>
        </div>

        {/* Expiry Quarantine & Safe Disposal Protocol Notice */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-space-sm">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Regulatory Compliance</h2>
              <span className="p-1 rounded-full bg-[#FEF2F2] text-error">
                <span className="material-symbols-outlined text-[18px]">verified_user</span>
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-outline mb-space-md">Pesticide regulatory mandate &amp; environmental safety.</p>
            <div className="p-space-sm rounded-lg bg-[#FFFBEB] flex flex-col gap-1 mb-space-sm">
              <div className="flex items-center gap-1.5 font-label-md text-label-md font-bold text-[#92400E]">
                <span className="material-symbols-outlined text-[18px]">report</span>
                <span>Batch Disposal Alert</span>
              </div>
              <p className="font-body-sm text-body-sm text-[#92400E]">
                Batch <strong>#AAG-GLY-902</strong> (Target Glyphosate) has officially crossed statutory field shelf-life.
                Sale is strictly blocked under Provincial Agri Law.
              </p>
            </div>
            <ul className="flex flex-col gap-2 font-label-sm text-label-sm text-on-surface-variant">
              <li className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-secondary">check_circle</span>
                <span>Quarantine Locker physical seals intact</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-secondary">check_circle</span>
                <span>Barcode scanner block active at all POS terminals</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-tertiary">pending</span>
                <span>Supplier Return Gatepass pending dispatch</span>
              </li>
            </ul>
          </div>
          <div className="pt-space-md mt-space-md border-t border-surface-container flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-outline">Inspector: Dept of Agriculture</span>
            <button
              className="font-label-sm text-label-sm text-error font-semibold hover:underline flex items-center gap-1 cursor-pointer"
              type="button"
              onClick={() => alert('Viewing regulatory quarantine logs')}
            >
              <span>Quarantine Logs</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InventoryPage;
