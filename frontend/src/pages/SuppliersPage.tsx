import React, { useState, useMemo } from 'react';

interface Supplier {
  id: string;
  name: string;
  initials: string;
  initialsBg: string;
  initialsColor: string;
  code: string;
  locationDetails: string;
  contactPerson: string;
  designation: string;
  phone: string;
  ntn: string;
  territory: string;
  cityKey: string;
  categoryKey: string;
  purchases: number;
  paid: number;
  balancePayable: number;
  balanceDueText: string;
  isOverdue: boolean;
  compliance: string;
  isTier1?: boolean;
  status: 'Active' | 'On Hold';
}

const INITIAL_SUPPLIERS: Supplier[] = [
  {
    id: '01',
    name: 'Syngenta Pakistan Ltd',
    initials: 'SY',
    initialsBg: 'bg-[#006C49]/10',
    initialsColor: 'text-secondary',
    code: 'SYNG-MUL-992',
    locationDetails: 'Multan Industrial Estate',
    contactPerson: 'Kashif Rasheed',
    designation: 'Area Sales Manager (S. Punjab)',
    phone: '+92 300 8472190',
    ntn: '0834921-7',
    territory: 'Multan Hub',
    cityKey: 'multan',
    categoryKey: 'mnc',
    purchases: 18400000,
    paid: 16000000,
    balancePayable: 2400000,
    balanceDueText: 'Due in 15 days',
    isOverdue: false,
    compliance: 'Tier-1 Principal',
    isTier1: true,
    status: 'Active',
  },
  {
    id: '02',
    name: 'Engro Fertilizers Ltd',
    initials: 'EF',
    initialsBg: 'bg-primary-fixed',
    initialsColor: 'text-primary',
    code: 'ENG-LHR-02',
    locationDetails: 'Regional Supply Division',
    contactPerson: 'Zeeshan Butt',
    designation: 'Regional Supply Lead (Urea / DAP)',
    phone: '+92 321 9982415',
    ntn: '1425678-3',
    territory: 'Lahore HQ',
    cityKey: 'lahore',
    categoryKey: 'fertilizer',
    purchases: 14200000,
    paid: 12500000,
    balancePayable: 1700000,
    balanceDueText: 'Due in 24 days',
    isOverdue: false,
    compliance: 'Grade-A Corporate',
    isTier1: true,
    status: 'Active',
  },
  {
    id: '03',
    name: 'Bayer CropScience Pakistan',
    initials: 'BC',
    initialsBg: 'bg-tertiary-fixed',
    initialsColor: 'text-tertiary-container',
    code: 'BAY-FS-101',
    locationDetails: 'Faisalabad Central',
    contactPerson: 'Taimoor Hayat',
    designation: 'Direct Channel Sales Manager',
    phone: '+92 345 6112904',
    ntn: '0623910-1',
    territory: 'Faisalabad',
    cityKey: 'faisalabad',
    categoryKey: 'mnc',
    purchases: 8150000,
    paid: 8150000,
    balancePayable: 0,
    balanceDueText: 'Fully Settled (Nil)',
    isOverdue: false,
    compliance: 'Audited & Compliant',
    isTier1: true,
    status: 'Active',
  },
  {
    id: '04',
    name: 'FMC United Pvt Ltd',
    initials: 'FM',
    initialsBg: 'bg-error-container/40',
    initialsColor: 'text-on-error-container',
    code: 'FMC-SHW-04',
    locationDetails: 'Sahiwal Grain Terminal Road',
    contactPerson: 'Chaudhry Arshad',
    designation: 'Regional Logistics Officer',
    phone: '+92 301 7728341',
    ntn: '2901455-9',
    territory: 'Sahiwal',
    cityKey: 'sahiwal',
    categoryKey: 'formulator',
    purchases: 4200000,
    paid: 2850000,
    balancePayable: 1350000,
    balanceDueText: 'Overdue 8 days',
    isOverdue: true,
    compliance: 'Grade-A Approved',
    status: 'Active',
  },
  {
    id: '05',
    name: 'Ali Akbar Group',
    initials: 'AA',
    initialsBg: 'bg-surface-container-high',
    initialsColor: 'text-primary',
    code: 'AAG-LHR-91',
    locationDetails: 'Raiwind Road',
    contactPerson: 'Salman Farooq',
    designation: 'Senior Accounts Executive',
    phone: '+92 333 4192003',
    ntn: '3109284-2',
    territory: 'Lahore HQ',
    cityKey: 'lahore',
    categoryKey: 'formulator',
    purchases: 2100000,
    paid: 1400000,
    balancePayable: 700000,
    balanceDueText: 'Due in 40 days',
    isOverdue: false,
    compliance: 'Verified Dealer',
    status: 'Active',
  },
  {
    id: '06',
    name: 'Swat Agro Chemicals',
    initials: 'SA',
    initialsBg: 'bg-tertiary-fixed-dim/40',
    initialsColor: 'text-tertiary',
    code: 'SWT-MUL-12',
    locationDetails: 'Khanewal Road Complex',
    contactPerson: 'Malik Naveed Awan',
    designation: 'Branch Dispatch Coordinator',
    phone: '+92 300 6819920',
    ntn: '1827409-5',
    territory: 'Multan Hub',
    cityKey: 'multan',
    categoryKey: 'seed',
    purchases: 1200000,
    paid: 700000,
    balancePayable: 500000,
    balanceDueText: 'Due in 5 days',
    isOverdue: false,
    compliance: 'Pending NTN Update',
    status: 'On Hold',
  },
];

export const SuppliersPage: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>(INITIAL_SUPPLIERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterBalance, setFilterBalance] = useState('all');
  const [filterCity, setFilterCity] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Supplier Form State
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    category: 'Multinational Chemical',
    ntn: '',
    contactPerson: '',
    designation: '',
    phone: '',
    email: '',
    city: 'Multan Hub',
    address: '',
    enableKhata: true,
  });

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((item) => {
      // Search filter
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.contactPerson.toLowerCase().includes(query) ||
        item.phone.toLowerCase().includes(query) ||
        item.ntn.toLowerCase().includes(query) ||
        item.territory.toLowerCase().includes(query) ||
        item.code.toLowerCase().includes(query);

      // Category filter
      const matchesCategory =
        filterCategory === 'all' || item.categoryKey === filterCategory;

      // Balance filter
      const matchesBalance =
        filterBalance === 'all' ||
        (filterBalance === 'outstanding' && item.balancePayable > 0) ||
        (filterBalance === 'paid' && item.balancePayable === 0) ||
        (filterBalance === 'overdue' && item.isOverdue);

      // City filter
      const matchesCity = filterCity === 'all' || item.cityKey === filterCity;

      return matchesSearch && matchesCategory && matchesBalance && matchesCity;
    });
  }, [suppliers, searchQuery, filterCategory, filterBalance, filterCity]);

  const handleAddSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplier.name || !newSupplier.phone) return;

    const words = newSupplier.name.trim().split(' ');
    const initials = words.length > 1
      ? (words[0][0] + words[1][0]).toUpperCase()
      : newSupplier.name.slice(0, 2).toUpperCase();

    const createdSupplier: Supplier = {
      id: String(suppliers.length + 1).padStart(2, '0'),
      name: newSupplier.name,
      initials,
      initialsBg: 'bg-primary-fixed/40',
      initialsColor: 'text-primary',
      code: `DEP-${Math.floor(100 + Math.random() * 900)}`,
      locationDetails: newSupplier.address || 'Registered Office',
      contactPerson: newSupplier.contactPerson || 'Authorized Representative',
      designation: newSupplier.designation || 'Account Manager',
      phone: newSupplier.phone,
      ntn: newSupplier.ntn || 'Pending',
      territory: newSupplier.city,
      cityKey: newSupplier.city.toLowerCase().includes('multan')
        ? 'multan'
        : newSupplier.city.toLowerCase().includes('lahore')
        ? 'lahore'
        : newSupplier.city.toLowerCase().includes('faisalabad')
        ? 'faisalabad'
        : 'sahiwal',
      categoryKey: newSupplier.category.toLowerCase().includes('fertilizer')
        ? 'fertilizer'
        : newSupplier.category.toLowerCase().includes('seed')
        ? 'seed'
        : newSupplier.category.toLowerCase().includes('formulator')
        ? 'formulator'
        : 'mnc',
      purchases: 0,
      paid: 0,
      balancePayable: 0,
      balanceDueText: 'Fully Settled (Nil)',
      isOverdue: false,
      compliance: 'New Registrant',
      status: 'Active',
    };

    setSuppliers([createdSupplier, ...suppliers]);
    setIsModalOpen(false);
    setNewSupplier({
      name: '',
      category: 'Multinational Chemical',
      ntn: '',
      contactPerson: '',
      designation: '',
      phone: '',
      email: '',
      city: 'Multan Hub',
      address: '',
      enableKhata: true,
    });
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'Supplier Name', 'Code', 'Contact Person', 'Phone', 'NTN', 'Territory', 'Purchases', 'Paid', 'Balance', 'Status'];
    const rows = suppliers.map(s => [
      s.id,
      `"${s.name}"`,
      s.code,
      `"${s.contactPerson}"`,
      s.phone,
      s.ntn,
      `"${s.territory}"`,
      s.purchases,
      s.paid,
      s.balancePayable,
      s.status,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `suppliers_directory_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col w-full">
      {/* Dynamic Gradient Accent Ring (Background Depth Layer) */}
      <div className="relative w-full overflow-hidden pb-space-2xl">
        <div className="absolute -top-32 right-12 w-96 h-96 rounded-full bg-primary-fixed-dim/20 blur-3xl pointer-events-none"></div>
        <div className="absolute top-48 -left-20 w-80 h-80 rounded-full bg-secondary-fixed/20 blur-3xl pointer-events-none"></div>

        {/* Header & Breadcrumb Hierarchy Section */}
        <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-space-md mb-margin-lg">
          <div className="flex flex-col gap-space-xs">
            <div className="flex items-center gap-2">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                Procurement &amp; Supply Chain
              </span>
              <span className="w-1 h-1 rounded-full bg-outline-variant"></span>
              <span className="font-label-sm text-label-sm text-primary font-semibold">
                Vendor Central
              </span>
            </div>
            <h1 className="font-display text-display text-on-surface tracking-tight leading-none">
              Suppliers Directory
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
              Manage chemical manufacturers, authorized regional distributors, seed and fertilizer corporate suppliers across Punjab and Sindh distribution corridors.
            </p>
          </div>

          {/* Main Action Command Palette Buttons */}
          <div className="flex items-center flex-wrap gap-space-sm self-start md:self-auto shrink-0">
            <button
              className="h-10 px-space-md rounded-xl bg-surface-container-lowest text-on-surface font-label-md text-label-md shadow-sm hover:bg-surface-container-low transition-all flex items-center gap-2 cursor-pointer"
              id="btnPaymentSummary"
              onClick={() => alert('Opening Consolidated Supplier Payment Summary...')}
              type="button"
            >
              <span className="material-symbols-outlined text-[19px] text-primary">assessment</span>
              <span>Payment Summary</span>
            </button>
            <button
              className="h-10 px-space-md rounded-xl bg-surface-container-lowest text-on-surface font-label-md text-label-md shadow-sm hover:bg-surface-container-low transition-all flex items-center gap-2 cursor-pointer"
              id="btnExportCsv"
              onClick={handleExportCSV}
              type="button"
            >
              <span className="material-symbols-outlined text-[19px] text-outline">file_download</span>
              <span>Export CSV</span>
            </button>
            <button
              className="h-10 px-space-lg rounded-xl bg-primary text-on-primary font-label-lg text-label-lg shadow-md hover:bg-primary-container transition-all flex items-center gap-2 cursor-pointer"
              id="btnOpenNewSupplier"
              onClick={() => setIsModalOpen(true)}
              type="button"
            >
              <span className="material-symbols-outlined text-[20px]">add_business</span>
              <span>Add New Supplier</span>
            </button>
          </div>
        </div>

        {/* Top Summary Bento Cards (4 Tiles) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter-lg mb-margin-lg">
          {/* Card 1: Active Suppliers */}
          <div className="relative bg-surface-container-lowest rounded-xl p-space-lg shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between overflow-hidden">
            <div className="flex items-start justify-between">
              <div>
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline block">
                  Vendor Network
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-currency-stat text-currency-stat text-on-surface">28</span>
                  <span className="font-label-md text-label-md text-secondary font-semibold">Active Firms</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-primary-fixed/40 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[22px]">factory</span>
              </div>
            </div>
            <div className="mt-space-md pt-space-xs flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-outline font-label-sm text-label-sm">
                <span>Corporate MNCs &amp; National</span>
                <span className="text-on-surface font-medium">92% Tier-1</span>
              </div>
              <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
                <div className="bg-primary h-full rounded-full" style={{ width: '82%' }}></div>
              </div>
              <span className="font-body-sm text-body-sm text-on-surface-variant truncate">
                Bayer, Engro, FMC, Syngenta, Ali Akbar
              </span>
            </div>
          </div>

          {/* Card 2: Total Purchases (YTD) */}
          <div className="relative bg-surface-container-lowest rounded-xl p-space-lg shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between overflow-hidden">
            <div className="flex items-start justify-between">
              <div>
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline block">
                  Total Purchases (YTD)
                </span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="font-label-sm text-label-sm text-outline font-semibold">PKR</span>
                  <span className="font-currency-stat text-currency-stat text-on-surface">48,250,000</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-secondary-fixed/50 flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[22px]">receipt_long</span>
              </div>
            </div>
            <div className="mt-space-md pt-space-xs flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-secondary text-[16px]">trending_up</span>
                <span className="font-label-sm text-label-sm text-secondary font-semibold">+18.4%</span>
                <span className="font-body-sm text-body-sm text-outline">vs Kharif &apos;23</span>
              </div>
              {/* Sparkline representation inline SVG */}
              <svg className="w-20 h-6 text-primary stroke-current fill-none stroke-2" preserveAspectRatio="none" viewBox="0 0 100 30">
                <polyline points="0,25 20,20 40,22 60,10 80,14 100,5" strokeLinecap="round" strokeLinejoin="round"></polyline>
              </svg>
            </div>
          </div>

          {/* Card 3: Total Paid & Cleared */}
          <div className="relative bg-surface-container-lowest rounded-xl p-space-lg shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between overflow-hidden">
            <div className="flex items-start justify-between">
              <div>
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline block">
                  Total Settlements Paid
                </span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="font-label-sm text-label-sm text-outline font-semibold">PKR</span>
                  <span className="font-currency-stat text-currency-stat text-on-surface">41,600,000</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#ECFDF5] flex items-center justify-center text-[#065F46]">
                <span className="material-symbols-outlined text-[22px]">check_circle</span>
              </div>
            </div>
            <div className="mt-space-md pt-space-xs flex flex-col gap-1.5">
              <div className="flex items-center justify-between font-label-sm text-label-sm">
                <span className="text-secondary font-semibold">86.2% Cleared Rate</span>
                <span className="text-outline">64 Trans.</span>
              </div>
              <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
                <div className="bg-[#006C49] h-full rounded-full" style={{ width: '86.2%' }}></div>
              </div>
              <span className="font-body-sm text-body-sm text-outline truncate">
                Banking Transfer, Online Pay Order &amp; Direct Deposit
              </span>
            </div>
          </div>

          {/* Card 4: Outstanding Payables (Warning Alert Tile) */}
          <div className="relative bg-surface-container-lowest rounded-xl p-space-lg shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between overflow-hidden">
            <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-error-container/30 rounded-full blur-xl pointer-events-none"></div>
            <div className="flex items-start justify-between">
              <div>
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-error font-semibold block">
                  Outstanding Payables
                </span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="font-label-sm text-label-sm text-error font-semibold">PKR</span>
                  <span className="font-currency-stat text-currency-stat text-error">6,650,000</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-error-container/60 flex items-center justify-center text-on-error-container">
                <span className="material-symbols-outlined text-[22px]">pending_actions</span>
              </div>
            </div>
            <div className="mt-space-md pt-space-xs flex items-center justify-between">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#FEF2F2] text-[#991B1B]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#991B1B]"></span>
                <span className="font-label-sm text-label-sm font-semibold">5 Overdue Invoices</span>
              </div>
              <span className="font-label-sm text-label-sm text-outline">Due this cycle</span>
            </div>
          </div>
        </div>

        {/* Filter & Search Toolbar Container */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm mb-gutter-lg flex flex-col lg:flex-row gap-space-md lg:items-center justify-between">
          {/* Search Input Container */}
          <div className="relative flex-1 min-w-[280px]">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-outline text-[20px]">
              search
            </span>
            <input
              className="w-full h-11 pl-11 pr-10 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/20 transition-all"
              id="supplierSearchInput"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search supplier by company name, contact person, phone, NTN, city..."
              type="text"
              value={searchQuery}
            />
            {searchQuery && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface"
                id="clearSearchBtn"
                onClick={() => setSearchQuery('')}
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>

          {/* Filter Controls Group */}
          <div className="flex flex-wrap items-center gap-space-sm shrink-0">
            {/* Category Dropdown Filter */}
            <div className="relative">
              <select
                className="h-11 pl-3.5 pr-8 rounded-xl bg-surface-container-low text-on-surface font-label-md text-label-md appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
                id="filterCategory"
                onChange={(e) => setFilterCategory(e.target.value)}
                value={filterCategory}
              >
                <option value="all">Category: All Types (28)</option>
                <option value="mnc">Multinational Chemicals</option>
                <option value="fertilizer">National Fertilizer</option>
                <option value="seed">Seed Importers</option>
                <option value="formulator">Local Formulators</option>
              </select>
              <span className="material-symbols-outlined pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-outline text-[18px]">
                expand_more
              </span>
            </div>

            {/* Balance Status Filter */}
            <div className="relative">
              <select
                className="h-11 pl-3.5 pr-8 rounded-xl bg-surface-container-low text-on-surface font-label-md text-label-md appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
                id="filterBalance"
                onChange={(e) => setFilterBalance(e.target.value)}
                value={filterBalance}
              >
                <option value="all">Balance: All Vendors</option>
                <option value="outstanding">Outstanding Balance (&gt;0)</option>
                <option value="paid">Fully Settled / Nil (Rs. 0)</option>
                <option value="overdue">Overdue Payables (&gt;30d)</option>
              </select>
              <span className="material-symbols-outlined pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-outline text-[18px]">
                expand_more
              </span>
            </div>

            {/* City / Territory Filter */}
            <div className="relative">
              <select
                className="h-11 pl-3.5 pr-8 rounded-xl bg-surface-container-low text-on-surface font-label-md text-label-md appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
                id="filterCity"
                onChange={(e) => setFilterCity(e.target.value)}
                value={filterCity}
              >
                <option value="all">Region: Punjab &amp; Sindh</option>
                <option value="multan">Multan Hub</option>
                <option value="lahore">Lahore HQ</option>
                <option value="faisalabad">Faisalabad Division</option>
                <option value="sahiwal">Sahiwal Zone</option>
              </select>
              <span className="material-symbols-outlined pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-outline text-[18px]">
                expand_more
              </span>
            </div>

            {/* View Switcher Tabs */}
            <div className="flex items-center bg-surface-container-low p-1 rounded-xl">
              <button
                className={`px-2.5 py-1.5 rounded-lg font-label-sm text-label-sm flex items-center gap-1 cursor-pointer transition-colors ${
                  viewMode === 'table'
                    ? 'bg-surface-container-lowest text-primary shadow-xs'
                    : 'text-outline hover:text-on-surface'
                }`}
                onClick={() => setViewMode('table')}
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">format_list_bulleted</span>
                <span>Table</span>
              </button>
              <button
                className={`px-2.5 py-1.5 rounded-lg font-label-sm text-label-sm flex items-center gap-1 cursor-pointer transition-colors ${
                  viewMode === 'cards'
                    ? 'bg-surface-container-lowest text-primary shadow-xs'
                    : 'text-outline hover:text-on-surface'
                }`}
                onClick={() => setViewMode('cards')}
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">grid_view</span>
                <span>Cards</span>
              </button>
            </div>
          </div>
        </div>

        {/* Suppliers Content: Table or Cards View */}
        {viewMode === 'table' ? (
          <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse" id="suppliersTable">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">
                    <th className="py-3.5 px-space-md w-12 text-center" scope="col">#</th>
                    <th className="py-3.5 px-space-md" scope="col">Supplier &amp; Entity Name</th>
                    <th className="py-3.5 px-space-md" scope="col">Key Contact Person</th>
                    <th className="py-3.5 px-space-md" scope="col">Contact &amp; NTN</th>
                    <th className="py-3.5 px-space-md" scope="col">Territory</th>
                    <th className="py-3.5 px-space-md text-right" scope="col">Purchases (PKR)</th>
                    <th className="py-3.5 px-space-md text-right" scope="col">Paid (PKR)</th>
                    <th className="py-3.5 px-space-md text-right" scope="col">Balance Payable</th>
                    <th className="py-3.5 px-space-md text-center" scope="col">Compliance</th>
                    <th className="py-3.5 px-space-md text-center" scope="col">Status</th>
                    <th className="py-3.5 px-space-md text-right" scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-low font-body-md text-body-md text-on-surface">
                  {filteredSuppliers.map((sup) => (
                    <tr className="hover:bg-surface-container-low/60 transition-colors group" key={sup.id}>
                      <td className="py-4 px-space-md text-center font-label-sm text-label-sm text-outline">
                        {sup.id}
                      </td>
                      <td className="py-4 px-space-md">
                        <div className="flex items-center gap-space-sm">
                          <div className={`w-10 h-10 rounded-xl ${sup.initialsBg} ${sup.initialsColor} flex items-center justify-center font-headline-sm font-bold shrink-0`}>
                            {sup.initials}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-headline-sm text-headline-sm text-on-surface group-hover:text-primary transition-colors flex items-center gap-1.5">
                              {sup.name}
                              {sup.isTier1 && (
                                <span className="material-symbols-outlined text-[16px] text-primary" title="Verified Principal">
                                  verified
                                </span>
                              )}
                            </span>
                            <span className="font-label-sm text-label-sm text-outline">
                              Depot ID: {sup.code} • {sup.locationDetails}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-space-md">
                        <div className="flex flex-col">
                          <span className="font-label-lg text-label-lg text-on-surface font-semibold">
                            {sup.contactPerson}
                          </span>
                          <span className="font-label-sm text-label-sm text-outline">
                            {sup.designation}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-space-md">
                        <div className="flex flex-col text-on-surface">
                          <span className="font-label-md text-label-md font-medium tracking-tight">
                            {sup.phone}
                          </span>
                          <span className="font-body-sm text-body-sm text-outline">
                            NTN: {sup.ntn}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-space-md">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm">
                          <span className="material-symbols-outlined text-[14px] text-outline">location_on</span>
                          {sup.territory}
                        </span>
                      </td>
                      <td className="py-4 px-space-md text-right font-currency-cell text-currency-cell text-on-surface">
                        {sup.purchases.toLocaleString()}
                      </td>
                      <td className="py-4 px-space-md text-right font-currency-cell text-currency-cell text-[#006C49]">
                        {sup.paid.toLocaleString()}
                      </td>
                      <td className="py-4 px-space-md text-right">
                        <div className="flex flex-col items-end">
                          <span className={`font-currency-cell text-currency-cell font-bold ${sup.balancePayable > 0 ? 'text-error' : 'text-[#006C49]'}`}>
                            {sup.balancePayable === 0 ? '0.00' : sup.balancePayable.toLocaleString()}
                          </span>
                          <span className={`font-label-sm text-label-sm ${sup.balancePayable > 0 ? 'text-error' : 'text-[#006C49]'}`}>
                            {sup.balanceDueText}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-space-md text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-label-sm text-label-sm font-semibold ${
                          sup.compliance.includes('Pending')
                            ? 'bg-[#FFFBEB] text-[#92400E]'
                            : 'bg-[#ECFDF5] text-[#065F46]'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sup.compliance.includes('Pending') ? 'bg-[#92400E]' : 'bg-[#065F46]'}`}></span>
                          {sup.compliance}
                        </span>
                      </td>
                      <td className="py-4 px-space-md text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-label-sm text-label-sm font-semibold ${
                          sup.status === 'Active' ? 'bg-[#ECFDF5] text-[#065F46]' : 'bg-[#FFFBEB] text-[#92400E]'
                        }`}>
                          {sup.status}
                        </span>
                      </td>
                      <td className="py-4 px-space-md text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            className="w-8 h-8 rounded-lg bg-surface-container-high text-primary hover:bg-primary hover:text-on-primary transition-colors flex items-center justify-center cursor-pointer"
                            onClick={() => alert(`Opening Supplier Ledger for ${sup.name}...`)}
                            title="View Ledger"
                            type="button"
                          >
                            <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
                          </button>
                          <button
                            className="w-8 h-8 rounded-lg bg-surface-container-high text-[#006C49] hover:bg-secondary hover:text-on-secondary transition-colors flex items-center justify-center cursor-pointer"
                            onClick={() => alert(`Recording Payment for ${sup.name}...`)}
                            title="Record Payment"
                            type="button"
                          >
                            <span className="material-symbols-outlined text-[18px]">payments</span>
                          </button>
                          <button
                            className="w-8 h-8 rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest transition-colors flex items-center justify-center cursor-pointer"
                            onClick={() => alert(`New Purchase Order draft created for ${sup.name}...`)}
                            title="New Purchase Order"
                            type="button"
                          >
                            <span className="material-symbols-outlined text-[18px]">shopping_cart_checkout</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredSuppliers.length === 0 && (
                    <tr>
                      <td className="py-12 text-center text-outline font-body-md" colSpan={11}>
                        No suppliers match the selected filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination and Table Footer Control Bar */}
            <div className="px-space-lg py-3.5 bg-surface-container-low/70 flex flex-col sm:flex-row items-center justify-between gap-space-sm">
              <div className="flex items-center gap-space-sm font-body-sm text-body-sm text-on-surface-variant">
                <span>
                  Showing <span className="font-semibold text-on-surface">1 - {filteredSuppliers.length}</span> of <span className="font-semibold text-on-surface">28</span> suppliers
                </span>
                <span className="text-outline-variant">•</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-label-sm text-label-sm text-outline">Rows:</span>
                  <select className="bg-surface-container-lowest text-on-surface rounded-md px-1.5 py-0.5 font-label-sm text-label-sm focus:outline-none">
                    <option>10</option>
                    <option>25</option>
                    <option>50</option>
                  </select>
                </div>
              </div>

              {/* Pagination Controls */}
              <div className="flex items-center gap-1">
                <button
                  className="w-8 h-8 rounded-lg bg-surface-container-lowest text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors flex items-center justify-center disabled:opacity-40"
                  disabled
                  type="button"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                </button>
                <button
                  className="w-8 h-8 rounded-lg bg-primary text-on-primary font-label-sm text-label-sm font-semibold flex items-center justify-center shadow-xs"
                  type="button"
                >
                  1
                </button>
                <button
                  className="w-8 h-8 rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container-high transition-colors font-label-sm text-label-sm flex items-center justify-center cursor-pointer"
                  type="button"
                >
                  2
                </button>
                <button
                  className="w-8 h-8 rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container-high transition-colors font-label-sm text-label-sm flex items-center justify-center cursor-pointer"
                  type="button"
                >
                  3
                </button>
                <button
                  className="w-8 h-8 rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container-high transition-colors font-label-sm text-label-sm flex items-center justify-center cursor-pointer"
                  type="button"
                >
                  4
                </button>
                <button
                  className="w-8 h-8 rounded-lg bg-surface-container-lowest text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors flex items-center justify-center cursor-pointer"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Cards View Mode */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter-lg">
            {filteredSuppliers.map((sup) => (
              <div
                className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                key={sup.id}
              >
                <div>
                  <div className="flex items-start justify-between mb-space-sm">
                    <div className="flex items-center gap-space-sm">
                      <div className={`w-11 h-11 rounded-xl ${sup.initialsBg} ${sup.initialsColor} flex items-center justify-center font-headline-sm font-bold`}>
                        {sup.initials}
                      </div>
                      <div className="flex flex-col">
                        <h3 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-1">
                          {sup.name}
                          {sup.isTier1 && (
                            <span className="material-symbols-outlined text-[16px] text-primary" title="Verified Principal">
                              verified
                            </span>
                          )}
                        </h3>
                        <span className="font-label-sm text-label-sm text-outline">{sup.code}</span>
                      </div>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-label-sm text-label-sm font-semibold ${
                      sup.status === 'Active' ? 'bg-[#ECFDF5] text-[#065F46]' : 'bg-[#FFFBEB] text-[#92400E]'
                    }`}>
                      {sup.status}
                    </span>
                  </div>

                  <div className="mt-space-md space-y-2 text-body-sm font-body-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-outline">Contact Person:</span>
                      <span className="font-semibold text-on-surface">{sup.contactPerson}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-outline">Phone:</span>
                      <span className="font-medium text-on-surface">{sup.phone}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-outline">Territory:</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm">
                        {sup.territory}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-surface-container">
                      <span className="text-outline">Purchases:</span>
                      <span className="font-currency-cell text-on-surface">PKR {sup.purchases.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-outline">Balance:</span>
                      <span className={`font-currency-cell font-bold ${sup.balancePayable > 0 ? 'text-error' : 'text-secondary'}`}>
                        PKR {sup.balancePayable.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-space-lg pt-space-sm border-t border-surface-container flex items-center justify-between">
                  <span className="font-label-sm text-label-sm text-outline">{sup.compliance}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      className="p-1.5 rounded-lg bg-surface-container text-primary hover:bg-primary hover:text-on-primary transition-colors"
                      title="View Ledger"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
                    </button>
                    <button
                      className="p-1.5 rounded-lg bg-surface-container text-[#006C49] hover:bg-secondary hover:text-on-secondary transition-colors"
                      title="Record Payment"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[18px]">payments</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Asymmetric Quick-Action Ledger Reconciliation Hub & Depot Locations */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter-lg mt-margin-lg">
          {/* Card 1: Regional Procurement Breakdown Visualization */}
          <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-space-sm">
                <span className="font-headline-sm text-headline-sm text-on-surface">Category Distribution</span>
                <span className="font-label-sm text-label-sm text-primary font-semibold">Kharif Season</span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
                Product mix ratio across direct manufacturer accounts.
              </p>
              <div className="flex flex-col gap-3">
                <div>
                  <div className="flex justify-between font-label-sm text-label-sm mb-1">
                    <span className="text-on-surface">Insecticides &amp; Fungicides (MNCs)</span>
                    <span className="font-semibold text-on-surface">PKR 26.5M (55%)</span>
                  </div>
                  <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                    <div className="bg-primary h-full rounded-full" style={{ width: '55%' }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between font-label-sm text-label-sm mb-1">
                    <span className="text-on-surface">NPK / DAP Fertilizer Consignments</span>
                    <span className="font-semibold text-on-surface">PKR 14.2M (29%)</span>
                  </div>
                  <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                    <div className="bg-secondary h-full rounded-full" style={{ width: '29%' }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between font-label-sm text-label-sm mb-1">
                    <span className="text-on-surface">Certified Hybrid Seeds &amp; Bio-Nutrients</span>
                    <span className="font-semibold text-on-surface">PKR 7.55M (16%)</span>
                  </div>
                  <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                    <div className="bg-tertiary-container h-full rounded-full" style={{ width: '16%' }}></div>
                  </div>
                </div>
              </div>
            </div>
            <div className="pt-space-md mt-space-md flex items-center justify-between text-outline font-label-sm text-label-sm">
              <span>Updated today at 09:42 AM</span>
              <a className="text-primary font-semibold hover:underline flex items-center gap-1" href="#audit">
                <span>Audit Report</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </a>
            </div>
          </div>

          {/* Card 2: Upcoming Supplier Payables Schedule */}
          <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-space-sm">
                <span className="font-headline-sm text-headline-sm text-on-surface">Due Settlements Schedule</span>
                <span className="font-label-sm text-label-sm text-error font-semibold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-error"></span>
                  Attention
                </span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
                Pending disbursements required to protect credit lines.
              </p>
              <div className="space-y-space-sm">
                <div className="p-space-sm rounded-xl bg-surface-container-low flex items-center justify-between">
                  <div className="flex items-center gap-space-sm">
                    <span className="material-symbols-outlined text-error text-[20px]">warning</span>
                    <div className="flex flex-col">
                      <span className="font-label-md text-label-md text-on-surface font-semibold">
                        Swat Agro Chemicals
                      </span>
                      <span className="font-body-sm text-body-sm text-outline">Due: Within 5 Days</span>
                    </div>
                  </div>
                  <span className="font-currency-cell text-currency-cell text-error font-bold">Rs. 500,000</span>
                </div>
                <div className="p-space-sm rounded-xl bg-surface-container-low flex items-center justify-between">
                  <div className="flex items-center gap-space-sm">
                    <span className="material-symbols-outlined text-tertiary text-[20px]">schedule</span>
                    <div className="flex flex-col">
                      <span className="font-label-md text-label-md text-on-surface font-semibold">
                        Syngenta Pakistan Ltd
                      </span>
                      <span className="font-body-sm text-body-sm text-outline">Due: 15 Oct 2024</span>
                    </div>
                  </div>
                  <span className="font-currency-cell text-currency-cell text-on-surface font-bold">Rs. 2,400,000</span>
                </div>
                <div className="p-space-sm rounded-xl bg-surface-container-low flex items-center justify-between">
                  <div className="flex items-center gap-space-sm">
                    <span className="material-symbols-outlined text-outline text-[20px]">calendar_today</span>
                    <div className="flex flex-col">
                      <span className="font-label-md text-label-md text-on-surface font-semibold">
                        FMC United Chemicals
                      </span>
                      <span className="font-body-sm text-body-sm text-outline">Settlement Window</span>
                    </div>
                  </div>
                  <span className="font-currency-cell text-currency-cell text-on-surface font-bold">Rs. 1,350,000</span>
                </div>
              </div>
            </div>
            <button
              className="mt-space-md w-full h-10 rounded-xl bg-surface-container-high text-primary font-label-md text-label-md font-semibold hover:bg-surface-container-highest transition-colors flex items-center justify-center gap-2 cursor-pointer"
              onClick={() => alert('Preparing batch settlement slip for pending vendor disbursements...')}
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">account_balance</span>
              <span>Prepare Batch Settlement Slip</span>
            </button>
          </div>

          {/* Card 3: Central Warehouse Depot Map & Supply Nodes */}
          <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-space-sm">
                <span className="font-headline-sm text-headline-sm text-on-surface">Depot Logistics Hubs</span>
                <span className="font-label-sm text-label-sm text-secondary font-semibold">Connected</span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
                Multan South Depot coordinates direct manufacturer dispatches.
              </p>
              {/* Interactive Location / Map Node Card */}
              <div
                className="w-full h-36 bg-cover bg-center rounded-xl relative overflow-hidden flex items-end p-space-md"
                style={{
                  backgroundImage:
                    "url('https://lh3.googleusercontent.com/aida-public/AB6AXuA9x6eSkZQgZGNyKV8iGBa326onMhPghfKuf2wqE7EP_7Mo-Wgk3UWjtKa52jA_cKYeACn3U24qKsyndRmIjrzK51MhsbYTv7kyRCSSDxYdRflZSalmzTCXf7_o-nwjFnr_gi7-_A4Ws9BHUOC3qAXH30E_NBPMigVwemOQIT254HhSVa0RXRyI30eTe9biC8vsZl3UHqmkZXQ1vx0uiVUq8aRrSQ5wKTJOXySCEMXdeFXI7PZ8zsCNPw')",
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-on-surface/80 via-on-surface/30 to-transparent"></div>
                <div className="relative z-10 flex items-center justify-between w-full text-surface-container-lowest">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#6CF8BB] text-[20px]">warehouse</span>
                    <div>
                      <span className="font-label-md text-label-md font-bold block text-surface">
                        Multan Central Dispatch
                      </span>
                      <span className="font-body-sm text-body-sm text-surface-dim">
                        Receiving Dock #4 Active
                      </span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-secondary text-on-secondary font-label-sm text-label-sm">
                    Active
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-space-md flex items-center justify-between pt-space-xs">
              <div className="flex flex-col">
                <span className="font-label-sm text-label-sm text-outline">Lead Logistics Time</span>
                <span className="font-label-lg text-label-lg text-on-surface font-semibold">24 - 48 Hours</span>
              </div>
              <button
                className="h-9 px-space-md rounded-xl bg-surface-container-high text-on-surface font-label-md text-label-md hover:bg-surface-container-highest transition-colors flex items-center gap-1.5 cursor-pointer"
                onClick={() => alert('Displaying regional supply corridor logistics routing...')}
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">alt_route</span>
                <span>View Routing</span>
              </button>
            </div>
          </div>
        </div>

        {/* Quick Modal Slide-Over: Add New Supplier */}
        {isModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-end bg-inverse-surface/40 backdrop-blur-xs transition-opacity duration-300"
            id="newSupplierModal"
          >
            <div
              className="w-full max-w-xl h-full bg-surface-container-lowest shadow-2xl p-space-xl overflow-y-auto flex flex-col justify-between"
              id="newSupplierPanel"
            >
              <div>
                {/* Modal Header */}
                <div className="flex items-center justify-between pb-space-md mb-space-lg border-b border-surface-container">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center">
                      <span className="material-symbols-outlined text-[22px]">add_business</span>
                    </div>
                    <div>
                      <h2 className="font-headline-md text-headline-md text-on-surface">Add New Supplier</h2>
                      <span className="font-body-sm text-body-sm text-outline">
                        Register corporate manufacturer or distributor
                      </span>
                    </div>
                  </div>
                  <button
                    className="w-8 h-8 rounded-lg bg-surface-container-low text-outline hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer"
                    id="closeSupplierModal"
                    onClick={() => setIsModalOpen(false)}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>

                {/* Form Fields Container */}
                <form className="space-y-space-md" id="addSupplierForm" onSubmit={handleAddSupplier}>
                  <div>
                    <label className="block font-label-md text-label-md text-on-surface font-semibold mb-1">
                      Company / Entity Legal Name *
                    </label>
                    <input
                      className="w-full h-10 px-3.5 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/20"
                      onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                      placeholder="e.g. United Agro Chemical Corporation"
                      required
                      type="text"
                      value={newSupplier.name}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-space-md">
                    <div>
                      <label className="block font-label-md text-label-md text-on-surface font-semibold mb-1">
                        Supplier Type
                      </label>
                      <select
                        className="w-full h-10 px-3 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary/20"
                        onChange={(e) => setNewSupplier({ ...newSupplier, category: e.target.value })}
                        value={newSupplier.category}
                      >
                        <option>Multinational Chemical</option>
                        <option>National Fertilizer</option>
                        <option>Seed Importer / Producer</option>
                        <option>Local Pesticide Formulator</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-label-md text-label-md text-on-surface font-semibold mb-1">
                        Tax NTN / STRN *
                      </label>
                      <input
                        className="w-full h-10 px-3.5 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/20"
                        onChange={(e) => setNewSupplier({ ...newSupplier, ntn: e.target.value })}
                        placeholder="e.g. 4091823-1"
                        required
                        type="text"
                        value={newSupplier.ntn}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-space-md">
                    <div>
                      <label className="block font-label-md text-label-md text-on-surface font-semibold mb-1">
                        Primary Contact Person
                      </label>
                      <input
                        className="w-full h-10 px-3.5 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/20"
                        onChange={(e) => setNewSupplier({ ...newSupplier, contactPerson: e.target.value })}
                        placeholder="Full name"
                        type="text"
                        value={newSupplier.contactPerson}
                      />
                    </div>
                    <div>
                      <label className="block font-label-md text-label-md text-on-surface font-semibold mb-1">
                        Designation
                      </label>
                      <input
                        className="w-full h-10 px-3.5 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/20"
                        onChange={(e) => setNewSupplier({ ...newSupplier, designation: e.target.value })}
                        placeholder="e.g. Regional Manager"
                        type="text"
                        value={newSupplier.designation}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-space-md">
                    <div>
                      <label className="block font-label-md text-label-md text-on-surface font-semibold mb-1">
                        Official Mobile Phone *
                      </label>
                      <input
                        className="w-full h-10 px-3.5 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/20"
                        onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                        placeholder="+92 300 0000000"
                        required
                        type="tel"
                        value={newSupplier.phone}
                      />
                    </div>
                    <div>
                      <label className="block font-label-md text-label-md text-on-surface font-semibold mb-1">
                        Accounts Email
                      </label>
                      <input
                        className="w-full h-10 px-3.5 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/20"
                        onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
                        placeholder="finance@company.com"
                        type="email"
                        value={newSupplier.email}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-label-md text-label-md text-on-surface font-semibold mb-1">
                      Operating Territory / City
                    </label>
                    <select
                      className="w-full h-10 px-3 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary/20"
                      onChange={(e) => setNewSupplier({ ...newSupplier, city: e.target.value })}
                      value={newSupplier.city}
                    >
                      <option>Multan Hub</option>
                      <option>Lahore Central</option>
                      <option>Faisalabad Zone</option>
                      <option>Sahiwal Corridor</option>
                      <option>Rahim Yar Khan</option>
                      <option>Sukkur / Hyderabad</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-label-md text-label-md text-on-surface font-semibold mb-1">
                      Depot Office Address
                    </label>
                    <textarea
                      className="w-full p-3 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/20"
                      onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })}
                      placeholder="Full street address, warehouse sector, depot number..."
                      rows={3}
                      value={newSupplier.address}
                    ></textarea>
                  </div>

                  <div className="p-space-md rounded-xl bg-surface-container-low flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="font-label-md text-label-md text-on-surface font-semibold">
                        Enable Khata Credit Facility
                      </span>
                      <span className="font-body-sm text-body-sm text-outline">
                        Authorize purchase on credit terms (Net 30/60)
                      </span>
                    </div>
                    <input
                      checked={newSupplier.enableKhata}
                      className="w-5 h-5 text-primary rounded focus:ring-0 cursor-pointer"
                      onChange={(e) => setNewSupplier({ ...newSupplier, enableKhata: e.target.checked })}
                      type="checkbox"
                    />
                  </div>

                  {/* Modal Action Footer */}
                  <div className="pt-space-md mt-space-md flex items-center gap-space-sm justify-end border-t border-surface-container">
                    <button
                      className="h-11 px-space-lg rounded-xl bg-surface-container-high text-on-surface font-label-md text-label-md hover:bg-surface-container-highest transition-colors cursor-pointer"
                      id="cancelModalBtn"
                      onClick={() => setIsModalOpen(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="h-11 px-space-xl rounded-xl bg-primary text-on-primary font-label-lg text-label-lg shadow-md hover:bg-primary-container transition-all flex items-center gap-2 cursor-pointer"
                      id="submitSupplierBtn"
                      type="submit"
                    >
                      <span className="material-symbols-outlined text-[20px]">save</span>
                      <span>Save Supplier</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SuppliersPage;
