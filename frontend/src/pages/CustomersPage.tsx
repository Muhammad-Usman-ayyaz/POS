import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

interface Farmer {
  id: string;
  name: string;
  initials: string;
  initialsBg: string;
  initialsColor: string;
  khataId: string;
  cnic: string;
  phone: string;
  village: string;
  villageKey: string;
  acres: number;
  crops: string[];
  totalPurchases: number;
  totalPaid: number;
  khataDue: number;
  dueText: string;
  dueTextColor?: string;
  creditHealth: 'Good Standing' | 'Attention - Due' | 'Limit Reached' | 'Overdue Alert' | 'Cleared / Cash Client';
  healthBadgeBg: string;
  healthBadgeText: string;
}

const INITIAL_FARMERS: Farmer[] = [
  {
    id: '01',
    name: 'Chaudhry Riaz Ahmed',
    initials: 'CR',
    initialsBg: 'bg-primary-fixed',
    initialsColor: 'text-on-primary-fixed',
    khataId: 'PK-FSD-4201',
    cnic: '33100-8492019-3',
    phone: '0300-8712394',
    village: 'Chak 42-RB, Tehsil Faisalabad',
    villageKey: 'chak42',
    acres: 45,
    crops: ['Wheat', 'Cotton'],
    totalPurchases: 1450000,
    totalPaid: 1305000,
    khataDue: 145000,
    dueText: 'Due in 15 days',
    creditHealth: 'Good Standing',
    healthBadgeBg: 'bg-[#ECFDF5]',
    healthBadgeText: 'text-[#065F46]',
  },
  {
    id: '02',
    name: 'Malik Tariq Mehmood',
    initials: 'MT',
    initialsBg: 'bg-secondary-container',
    initialsColor: 'text-on-secondary-container',
    khataId: 'PK-SRG-1904',
    cnic: '38403-1249821-1',
    phone: '0321-6549821',
    village: 'Kot Momin, Sargodha',
    villageKey: 'kotmomin',
    acres: 120,
    crops: ['Kinnow (Citrus)', 'Wheat'],
    totalPurchases: 2840000,
    totalPaid: 2755800,
    khataDue: 84200,
    dueText: 'Harvest Linked',
    dueTextColor: 'text-secondary',
    creditHealth: 'Good Standing',
    healthBadgeBg: 'bg-[#ECFDF5]',
    healthBadgeText: 'text-[#065F46]',
  },
  {
    id: '03',
    name: 'Haji Munir Gujjar',
    initials: 'HM',
    initialsBg: 'bg-tertiary-fixed',
    initialsColor: 'text-on-tertiary-fixed',
    khataId: 'PK-BHW-0812',
    cnic: '38402-9938472-7',
    phone: '0345-7193021',
    village: 'Bhalwal Mandi',
    villageKey: 'bhalwal',
    acres: 35,
    crops: ['Sugarcane', 'Wheat'],
    totalPurchases: 920000,
    totalPaid: 858000,
    khataDue: 62000,
    dueText: 'Due 38 Days',
    dueTextColor: 'text-tertiary',
    creditHealth: 'Attention - Due',
    healthBadgeBg: 'bg-[#FFFBEB]',
    healthBadgeText: 'text-[#92400E]',
  },
  {
    id: '04',
    name: 'Rana Zulfiqar Ali',
    initials: 'RZ',
    initialsBg: 'bg-error-container',
    initialsColor: 'text-on-error-container',
    khataId: 'PK-SRG-1102',
    cnic: '35401-4491029-5',
    phone: '0302-9844120',
    village: 'Chak 110-SB, Sargodha',
    villageKey: 'chak110',
    acres: 80,
    crops: ['Wheat', 'Maize'],
    totalPurchases: 1980000,
    totalPaid: 1480000,
    khataDue: 500000,
    dueText: 'Limit: 500,000 (100%)',
    dueTextColor: 'text-outline',
    creditHealth: 'Limit Reached',
    healthBadgeBg: 'bg-[#FFFBEB]',
    healthBadgeText: 'text-[#92400E]',
  },
  {
    id: '05',
    name: 'Mian Aslam Javed',
    initials: 'MA',
    initialsBg: 'bg-error',
    initialsColor: 'text-on-error',
    khataId: 'PK-SHP-3319',
    cnic: '38401-7712384-9',
    phone: '0333-8419200',
    village: 'Shahpur Sadar',
    villageKey: 'shahpur',
    acres: 25,
    crops: ['Rice', 'Wheat'],
    totalPurchases: 640000,
    totalPaid: 420000,
    khataDue: 220000,
    dueText: 'Overdue > 65 days',
    dueTextColor: 'text-error font-semibold',
    creditHealth: 'Overdue Alert',
    healthBadgeBg: 'bg-[#FEF2F2]',
    healthBadgeText: 'text-[#991B1B]',
  },
  {
    id: '06',
    name: 'Babar Sultan Kahlon',
    initials: 'BS',
    initialsBg: 'bg-secondary',
    initialsColor: 'text-on-secondary',
    khataId: 'PK-GJR-5503',
    cnic: '33102-1849204-1',
    phone: '0301-4920194',
    village: 'Gojra Road',
    villageKey: 'gojra',
    acres: 60,
    crops: ['Sugarcane', 'Cotton'],
    totalPurchases: 1120000,
    totalPaid: 1120000,
    khataDue: 0,
    dueText: 'Fully Settled',
    dueTextColor: 'text-secondary',
    creditHealth: 'Cleared / Cash Client',
    healthBadgeBg: 'bg-[#ECFDF5]',
    healthBadgeText: 'text-[#065F46]',
  },
];

export const CustomersPage: React.FC = () => {
  const navigate = useNavigate();
  const [farmers, setFarmers] = useState<Farmer[]>(INITIAL_FARMERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [villageFilter, setVillageFilter] = useState('');
  const [cropFilter, setCropFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortFilter, setSortFilter] = useState('highest_balance');
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New Farmer Form State
  const [newFarmer, setNewFarmer] = useState({
    name: '',
    cnic: '',
    phone: '',
    village: '',
    acres: '',
    crops: 'Wheat, Cotton',
    creditLimit: '300000',
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const filteredFarmers = useMemo(() => {
    let result = farmers.filter((f) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        f.name.toLowerCase().includes(q) ||
        f.cnic.includes(q) ||
        f.phone.includes(q) ||
        f.village.toLowerCase().includes(q) ||
        f.khataId.toLowerCase().includes(q);

      const matchesVillage = !villageFilter || f.villageKey === villageFilter;
      const matchesCrop =
        !cropFilter ||
        f.crops.some((c) => c.toLowerCase().includes(cropFilter.toLowerCase()));

      let matchesStatus = true;
      if (statusFilter === 'good') matchesStatus = f.creditHealth === 'Good Standing';
      else if (statusFilter === 'limit') matchesStatus = f.creditHealth === 'Limit Reached';
      else if (statusFilter === 'overdue') matchesStatus = f.creditHealth === 'Overdue Alert';
      else if (statusFilter === 'cleared') matchesStatus = f.khataDue === 0;

      return matchesSearch && matchesVillage && matchesCrop && matchesStatus;
    });

    if (sortFilter === 'highest_balance') {
      result.sort((a, b) => b.khataDue - a.khataDue);
    } else if (sortFilter === 'name_asc') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortFilter === 'acres_desc') {
      result.sort((a, b) => b.acres - a.acres);
    } else if (sortFilter === 'purchases_desc') {
      result.sort((a, b) => b.totalPurchases - a.totalPurchases);
    }

    return result;
  }, [farmers, searchQuery, villageFilter, cropFilter, statusFilter, sortFilter]);

  const handleRegisterFarmer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFarmer.name || !newFarmer.phone) return;

    const words = newFarmer.name.trim().split(' ');
    const initials =
      words.length > 1
        ? (words[0][0] + words[1][0]).toUpperCase()
        : newFarmer.name.slice(0, 2).toUpperCase();

    const createdFarmer: Farmer = {
      id: String(farmers.length + 1).padStart(2, '0'),
      name: newFarmer.name,
      initials,
      initialsBg: 'bg-primary-fixed',
      initialsColor: 'text-on-primary-fixed',
      khataId: `PK-REG-${Math.floor(1000 + Math.random() * 9000)}`,
      cnic: newFarmer.cnic || '33100-XXXXXXX-X',
      phone: newFarmer.phone,
      village: newFarmer.village || 'Tehsil Mandi Zone',
      villageKey: 'chak42',
      acres: Number(newFarmer.acres) || 15,
      crops: newFarmer.crops.split(',').map((c) => c.trim()),
      totalPurchases: 0,
      totalPaid: 0,
      khataDue: 0,
      dueText: 'New Client',
      creditHealth: 'Good Standing',
      healthBadgeBg: 'bg-[#ECFDF5]',
      healthBadgeText: 'text-[#065F46]',
    };

    setFarmers([createdFarmer, ...farmers]);
    setIsRegisterOpen(false);
    setNewFarmer({
      name: '',
      cnic: '',
      phone: '',
      village: '',
      acres: '',
      crops: 'Wheat, Cotton',
      creditLimit: '300000',
    });
    showToast(`Farmer ${createdFarmer.name} registered successfully!`);
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'Farmer Name', 'Khata ID', 'CNIC', 'Phone', 'Village', 'Acres', 'Crops', 'Total Purchases', 'Total Paid', 'Current Khata Due', 'Credit Health'];
    const rows = farmers.map(f => [
      f.id,
      `"${f.name}"`,
      f.khataId,
      f.cnic,
      f.phone,
      `"${f.village}"`,
      f.acres,
      `"${f.crops.join(', ')}"`,
      f.totalPurchases,
      f.totalPaid,
      f.khataDue,
      `"${f.creditHealth}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `farmers_directory_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col w-full gap-space-xl">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 flex items-center gap-2 px-space-md py-3 rounded-xl bg-on-surface text-surface shadow-xl animate-bounce">
          <span className="material-symbols-outlined text-secondary text-[20px]">check_circle</span>
          <span className="font-label-md text-label-md">{toastMessage}</span>
        </div>
      )}

      {/* Top Navigation & Action Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
        <div className="flex flex-col gap-space-xs">
          <div className="flex items-center gap-space-xs font-label-md text-label-md text-outline">
            <span>Customers &amp; Khata</span>
            <span className="text-outline-variant">/</span>
            <span className="text-primary font-semibold">Farmers Directory</span>
          </div>
          <div className="flex items-center gap-space-sm">
            <h1 className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight">
              Farmers &amp; Customers Directory
            </h1>
            <span className="px-space-xs py-0.5 rounded-full bg-surface-container-high text-primary font-label-sm text-label-sm">
              Rabi 2024-25
            </span>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
            Manage registered agricultural clients, credit ratings, village landholdings, crop cycles, and khata ledger balances.
          </p>
        </div>

        {/* Right Quick Actions */}
        <div className="flex flex-wrap items-center gap-space-sm shrink-0">
          <button
            className="h-[38px] px-space-md rounded-lg bg-surface-container-lowest text-on-surface font-label-md text-label-md shadow-sm hover:bg-surface-container-low transition-colors flex items-center gap-1.5 cursor-pointer"
            onClick={handleExportCSV}
            type="button"
          >
            <span className="material-symbols-outlined text-[18px] text-outline">file_download</span>
            <span>Export Farmers CSV</span>
          </button>
          <button
            className="h-[38px] px-space-md rounded-lg bg-surface-container-lowest text-on-surface font-label-md text-label-md shadow-sm hover:bg-surface-container-low transition-colors flex items-center gap-1.5 cursor-pointer"
            onClick={() => showToast('Opening SMS broadcast module for 842 registered farmers...')}
            type="button"
          >
            <span className="material-symbols-outlined text-[18px] text-primary">sms</span>
            <span>Send SMS Broadcast</span>
          </button>
          <button
            className="h-[38px] px-space-lg rounded-lg bg-primary text-on-primary font-label-md text-label-md shadow-sm hover:bg-primary-container transition-colors flex items-center gap-1.5 cursor-pointer"
            onClick={() => setIsRegisterOpen(true)}
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            <span>Register New Farmer</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Overview Cards (4 Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-gutter-lg">
        {/* Stat 1 */}
        <div className="p-space-lg bg-surface-container-lowest rounded-xl shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                Total Registered Farmers
              </span>
              <span className="font-currency-stat text-currency-stat text-on-surface mt-1">842</span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">
              <span className="material-symbols-outlined text-[22px]">agriculture</span>
            </div>
          </div>
          <div className="mt-space-md pt-space-xs flex items-center gap-2">
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-[#ECFDF5] text-[#065F46] font-label-sm text-label-sm">
              <span className="material-symbols-outlined text-[14px]">trending_up</span>
              +24 this Rabi season
            </span>
            <span className="font-body-sm text-body-sm text-outline">Active Accounts</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary opacity-20 group-hover:opacity-100 transition-opacity"></div>
        </div>

        {/* Stat 2 */}
        <div className="p-space-lg bg-surface-container-lowest rounded-xl shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                Total Outstanding Khata
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="font-label-sm text-label-sm text-outline">PKR</span>
                <span className="font-currency-stat text-currency-stat text-on-surface">18,450,000</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary-container shrink-0">
              <span className="material-symbols-outlined text-[22px]">account_balance_wallet</span>
            </div>
          </div>
          <div className="mt-space-md pt-space-xs flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-surface-container-low text-primary font-label-sm text-label-sm font-semibold">
              312 Accounts
            </span>
            <span className="font-body-sm text-body-sm text-on-surface-variant truncate">
              Secured against crop liens
            </span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary-container opacity-20 group-hover:opacity-100 transition-opacity"></div>
        </div>

        {/* Stat 3 */}
        <div className="p-space-lg bg-surface-container-lowest rounded-xl shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-error">
                Overdue Kharif Balances
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="font-label-sm text-label-sm text-error">PKR</span>
                <span className="font-currency-stat text-currency-stat text-error">3,210,000</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-error-container flex items-center justify-center text-error shrink-0">
              <span className="material-symbols-outlined text-[22px]">warning</span>
            </div>
          </div>
          <div className="mt-space-md pt-space-xs flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FEF2F2] text-[#991B1B] font-label-sm text-label-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-[#991B1B] animate-pulse"></span>
              48 Farmers &gt; 60 Days
            </span>
            <span className="font-body-sm text-body-sm text-outline">Action required</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-error opacity-40 group-hover:opacity-100 transition-opacity"></div>
        </div>

        {/* Stat 4 */}
        <div className="p-space-lg bg-surface-container-lowest rounded-xl shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                Season Collection Rate
              </span>
              <span className="font-currency-stat text-currency-stat text-on-surface mt-1">78.4%</span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#ECFDF5] flex items-center justify-center text-[#065F46] shrink-0">
              <span className="material-symbols-outlined text-[22px]">savings</span>
            </div>
          </div>
          <div className="mt-space-md pt-space-xs flex flex-col gap-1.5">
            <div className="w-full bg-surface-container-low h-2 rounded-full overflow-hidden">
              <div className="bg-secondary h-full rounded-full transition-all duration-700" style={{ width: '78.4%' }}></div>
            </div>
            <div className="flex justify-between font-label-sm text-label-sm text-outline">
              <span>Target: 85%</span>
              <span className="text-secondary font-medium">Harvest settling</span>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-secondary opacity-20 group-hover:opacity-100 transition-opacity"></div>
        </div>
      </div>

      {/* Search & Structured Filter Bar */}
      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col gap-space-md">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-space-sm items-center">
          {/* Search Input */}
          <div className="md:col-span-4 relative flex items-center">
            <span className="material-symbols-outlined absolute left-3 text-outline text-[20px]">search</span>
            <input
              className="h-[38px] w-full pl-9 pr-3 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest focus:shadow-sm transition-all"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search farmer name, CNIC, mobile, village / mouza..."
              type="text"
              value={searchQuery}
            />
          </div>

          {/* Village Filter */}
          <div className="md:col-span-2 relative">
            <select
              className="h-[38px] w-full px-3 pr-8 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm appearance-none focus:outline-none focus:bg-surface-container-lowest transition-all cursor-pointer"
              onChange={(e) => setVillageFilter(e.target.value)}
              value={villageFilter}
            >
              <option value="">All Villages (All)</option>
              <option value="chak42">Chak 42-RB (Faisalabad)</option>
              <option value="kotmomin">Kot Momin (Sargodha)</option>
              <option value="bhalwal">Bhalwal Mandi</option>
              <option value="chak110">Chak 110-SB</option>
              <option value="shahpur">Shahpur Sadar</option>
              <option value="gojra">Gojra Road Belt</option>
            </select>
            <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-outline pointer-events-none text-[18px]">
              expand_more
            </span>
          </div>

          {/* Crop Filter */}
          <div className="md:col-span-2 relative">
            <select
              className="h-[38px] w-full px-3 pr-8 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm appearance-none focus:outline-none focus:bg-surface-container-lowest transition-all cursor-pointer"
              onChange={(e) => setCropFilter(e.target.value)}
              value={cropFilter}
            >
              <option value="">All Crops (Cycle)</option>
              <option value="wheat">Wheat (Gandum)</option>
              <option value="citrus">Citrus / Kinnow</option>
              <option value="sugarcane">Sugarcane (Kamad)</option>
              <option value="cotton">Cotton (Kapas)</option>
              <option value="rice">Basmati Rice (Dhan)</option>
              <option value="maize">Maize / Corn</option>
            </select>
            <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-outline pointer-events-none text-[18px]">
              expand_more
            </span>
          </div>

          {/* Status Filter */}
          <div className="md:col-span-2 relative">
            <select
              className="h-[38px] w-full px-3 pr-8 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm appearance-none focus:outline-none focus:bg-surface-container-lowest transition-all cursor-pointer"
              onChange={(e) => setStatusFilter(e.target.value)}
              value={statusFilter}
            >
              <option value="">Credit Status: All</option>
              <option value="good">Good Standing</option>
              <option value="limit">Credit Limit Reached</option>
              <option value="overdue">Overdue (&gt;60 Days)</option>
              <option value="cleared">Zero Balance / Cash</option>
            </select>
            <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-outline pointer-events-none text-[18px]">
              expand_more
            </span>
          </div>

          {/* Sort Filter */}
          <div className="md:col-span-2 relative">
            <select
              className="h-[38px] w-full px-3 pr-8 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm appearance-none focus:outline-none focus:bg-surface-container-lowest transition-all cursor-pointer"
              onChange={(e) => setSortFilter(e.target.value)}
              value={sortFilter}
            >
              <option value="highest_balance">Sort: Highest Khata</option>
              <option value="name_asc">Name (A-Z)</option>
              <option value="acres_desc">Landholding (Largest)</option>
              <option value="purchases_desc">Highest Purchases (YTD)</option>
            </select>
            <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-outline pointer-events-none text-[18px]">
              sort
            </span>
          </div>
        </div>

        {/* Active Tag Badges */}
        <div className="flex items-center gap-space-sm pt-space-xs overflow-x-auto">
          <span className="font-label-sm text-label-sm text-outline shrink-0">Active Quick Filters:</span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface-container font-label-sm text-label-sm text-primary shrink-0">
            Season: Rabi 2024-2025
            <span
              className="material-symbols-outlined text-[14px] cursor-pointer hover:text-error"
              onClick={() => showToast('Season fixed to current fiscal period')}
            >
              close
            </span>
          </span>
          {statusFilter && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface-container font-label-sm text-label-sm text-primary shrink-0">
              Status: {statusFilter}
              <span
                className="material-symbols-outlined text-[14px] cursor-pointer hover:text-error"
                onClick={() => setStatusFilter('')}
              >
                close
              </span>
            </span>
          )}
          <button
            className="font-label-sm text-label-sm text-outline hover:text-primary transition-colors shrink-0 ml-auto cursor-pointer"
            onClick={() => {
              setSearchQuery('');
              setVillageFilter('');
              setCropFilter('');
              setStatusFilter('');
              setSortFilter('highest_balance');
            }}
            type="button"
          >
            Reset All Filters
          </button>
        </div>
      </div>

      {/* Farmers Data Table */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
        {/* Table Controls Header */}
        <div className="px-space-lg py-space-md flex flex-wrap items-center justify-between gap-space-sm bg-surface-container-low/50">
          <div className="flex items-center gap-space-sm">
            <span className="font-headline-sm text-headline-sm text-on-surface">Registered Farmers</span>
            <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm font-semibold">
              {filteredFarmers.length} Displayed of 842
            </span>
          </div>
          <div className="flex items-center gap-space-xs font-label-sm text-label-sm text-outline">
            <span>Rows per page:</span>
            <span className="px-2 py-1 rounded bg-surface-container-lowest text-on-surface font-semibold shadow-xs">25</span>
            <span className="material-symbols-outlined text-[16px]">arrow_drop_down</span>
          </div>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-outline font-label-sm text-label-sm uppercase tracking-wider">
                <th className="py-3 px-4 w-12 text-center">#</th>
                <th className="py-3 px-4 min-w-[220px]">Farmer / Customer Name</th>
                <th className="py-3 px-4 min-w-[190px]">CNIC &amp; Contact</th>
                <th className="py-3 px-4 min-w-[210px]">Village &amp; Landholding</th>
                <th className="py-3 px-4 min-w-[150px]">Primary Crops</th>
                <th className="py-3 px-4 text-right min-w-[130px]">Total Purchases</th>
                <th className="py-3 px-4 text-right min-w-[120px]">Total Paid</th>
                <th className="py-3 px-4 text-right min-w-[150px]">Current Khata Due</th>
                <th className="py-3 px-4 text-center min-w-[140px]">Credit Health</th>
                <th className="py-3 px-4 text-center min-w-[160px]">Actions</th>
              </tr>
            </thead>
            <tbody className="font-body-md text-body-md text-on-surface divide-y divide-surface-container-low">
              {filteredFarmers.map((f) => (
                <tr className="hover:bg-surface-container-low/60 transition-colors" key={f.id}>
                  <td className="py-3.5 px-4 text-center font-label-sm text-outline">{f.id}</td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-space-sm">
                      <div className={`w-8 h-8 rounded-full ${f.initialsBg} ${f.initialsColor} font-headline-sm text-headline-sm flex items-center justify-center shrink-0`}>
                        {f.initials}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <button
                          className="font-headline-sm text-headline-sm text-primary hover:underline font-semibold truncate leading-tight text-left cursor-pointer"
                          onClick={() => navigate(`/customers/${f.id}`)}
                          type="button"
                        >
                          {f.name}
                        </button>
                        <span className="font-label-sm text-label-sm text-outline">Khata ID: {f.khataId}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex flex-col">
                      <span className="font-mono text-body-sm font-medium text-on-surface">{f.cnic}</span>
                      <span className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px] text-outline">call</span>
                        {f.phone}
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex flex-col">
                      <span className="font-label-md text-label-md text-on-surface">{f.village}</span>
                      <span className="font-label-sm text-label-sm text-secondary font-semibold">
                        {f.acres} Acres Landholding
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex flex-wrap gap-1">
                      {f.crops.map((crop, idx) => (
                        <span
                          className="px-2 py-0.5 rounded bg-surface-container font-label-sm text-label-sm text-on-surface-variant"
                          key={idx}
                        >
                          {crop}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <span className="font-currency-cell text-currency-cell text-on-surface">
                      {f.totalPurchases.toLocaleString()}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <span className="font-currency-cell text-currency-cell text-secondary">
                      {f.totalPaid.toLocaleString()}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex flex-col items-end">
                      <span className={`font-currency-cell text-currency-cell font-bold ${f.khataDue > 0 ? 'text-primary' : 'text-secondary'}`}>
                        {f.khataDue === 0 ? '0.00' : f.khataDue.toLocaleString()}
                      </span>
                      <span className={`font-label-sm text-label-sm ${f.dueTextColor || 'text-outline'}`}>
                        {f.dueText}
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-label-sm text-label-sm font-medium ${f.healthBadgeBg} ${f.healthBadgeText}`}>
                      {f.creditHealth}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <div className="inline-flex items-center gap-1">
                      <button
                        className="h-8 px-2.5 rounded bg-surface-container text-primary hover:bg-surface-container-high transition-colors font-label-sm text-label-sm flex items-center gap-1 cursor-pointer"
                        onClick={() => navigate('/khata')}
                        title="Print Khata Ledger PDF"
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                        <span>Ledger</span>
                      </button>
                      <button
                        className="h-8 px-2.5 rounded bg-primary text-on-primary hover:bg-primary-container transition-colors font-label-sm text-label-sm flex items-center gap-1 cursor-pointer"
                        onClick={() => navigate('/payments')}
                        title="Record Instant Payment"
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[16px]">payments</span>
                        <span>Pay</span>
                      </button>
                      <button
                        className="w-8 h-8 rounded bg-surface-container-low text-outline hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer"
                        onClick={() => navigate(`/customers/${f.id}`)}
                        title="View Profile Details"
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[18px]">visibility</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Table Pagination Footer */}
        <div className="px-space-lg py-space-sm flex flex-col sm:flex-row items-center justify-between gap-space-sm bg-surface-container-low/30">
          <span className="font-label-sm text-label-sm text-outline">
            Showing 1 to {filteredFarmers.length} of 842 total farmers across 28 village clusters
          </span>
          <div className="flex items-center gap-1">
            <button
              className="h-8 px-2.5 rounded bg-surface-container-lowest text-outline font-label-sm text-label-sm shadow-xs hover:bg-surface-container-high transition-colors disabled:opacity-40"
              disabled
              type="button"
            >
              Previous
            </button>
            <button className="h-8 w-8 rounded bg-primary text-on-primary font-label-sm text-label-sm font-bold shadow-xs" type="button">
              1
            </button>
            <button className="h-8 w-8 rounded bg-surface-container-lowest text-on-surface hover:bg-surface-container-high font-label-sm text-label-sm transition-colors cursor-pointer" type="button">
              2
            </button>
            <button className="h-8 w-8 rounded bg-surface-container-lowest text-on-surface hover:bg-surface-container-high font-label-sm text-label-sm transition-colors cursor-pointer" type="button">
              3
            </button>
            <span className="px-1 text-outline">...</span>
            <button className="h-8 w-8 rounded bg-surface-container-lowest text-on-surface hover:bg-surface-container-high font-label-sm text-label-sm transition-colors cursor-pointer" type="button">
              34
            </button>
            <button className="h-8 px-2.5 rounded bg-surface-container-lowest text-on-surface font-label-sm text-label-sm shadow-xs hover:bg-surface-container-high transition-colors cursor-pointer" type="button">
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Insights Row: 2 Asymmetric Bento Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-lg">
        {/* Left Widget: Village Credit Exposure (Top 5 Agricultural Clusters) */}
        <div className="lg:col-span-7 bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-space-md">
              <div className="flex flex-col">
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  Village Credit Exposure
                </span>
                <span className="font-label-sm text-label-sm text-outline">
                  Top agricultural clusters by active khata volume
                </span>
              </div>
              <span className="px-2.5 py-1 rounded bg-surface-container text-primary font-label-sm text-label-sm font-semibold">
                Top 5 Regions
              </span>
            </div>

            {/* Village List Bars */}
            <div className="flex flex-col gap-space-md">
              {/* Item 1 */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between font-label-sm text-label-sm">
                  <span className="text-on-surface font-semibold">Kot Momin (Sargodha) • Citrus Cluster</span>
                  <span className="text-primary font-currency-cell">PKR 5,420,000 (29.4%)</span>
                </div>
                <div className="w-full bg-surface-container-low h-2.5 rounded-full overflow-hidden">
                  <div className="bg-primary h-full rounded-full" style={{ width: '72%' }}></div>
                </div>
              </div>

              {/* Item 2 */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between font-label-sm text-label-sm">
                  <span className="text-on-surface font-semibold">Chak 42-RB &amp; Samundri • Wheat/Cotton</span>
                  <span className="text-primary font-currency-cell">PKR 4,110,000 (22.3%)</span>
                </div>
                <div className="w-full bg-surface-container-low h-2.5 rounded-full overflow-hidden">
                  <div className="bg-primary-container h-full rounded-full" style={{ width: '58%' }}></div>
                </div>
              </div>

              {/* Item 3 */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between font-label-sm text-label-sm">
                  <span className="text-on-surface font-semibold">Bhalwal Mandi • Sugarcane Belt</span>
                  <span className="text-primary font-currency-cell">PKR 3,250,000 (17.6%)</span>
                </div>
                <div className="w-full bg-surface-container-low h-2.5 rounded-full overflow-hidden">
                  <div className="bg-surface-tint h-full rounded-full" style={{ width: '44%' }}></div>
                </div>
              </div>

              {/* Item 4 */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between font-label-sm text-label-sm">
                  <span className="text-on-surface font-semibold">Chak 110-SB &amp; Sillanwali • Mixed Crops</span>
                  <span className="text-primary font-currency-cell">PKR 2,680,000 (14.5%)</span>
                </div>
                <div className="w-full bg-surface-container-low h-2.5 rounded-full overflow-hidden">
                  <div className="bg-primary-fixed-dim h-full rounded-full" style={{ width: '36%' }}></div>
                </div>
              </div>

              {/* Item 5 */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between font-label-sm text-label-sm">
                  <span className="text-on-surface font-semibold">Shahpur Sadar • Rice / Wheat Strip</span>
                  <span className="text-primary font-currency-cell">PKR 1,890,000 (10.2%)</span>
                </div>
                <div className="w-full bg-surface-container-low h-2.5 rounded-full overflow-hidden">
                  <div className="bg-outline-variant h-full rounded-full" style={{ width: '26%' }}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-space-md pt-space-sm flex items-center justify-between text-outline font-label-sm text-label-sm">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px] text-secondary">verified_user</span>
              84% secured via post-dated grain mandi receipts
            </span>
            <button
              className="text-primary hover:underline font-semibold flex items-center gap-0.5 cursor-pointer"
              onClick={() => navigate('/khata')}
              type="button"
            >
              <span>Detailed Khata Analysis</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          </div>
        </div>

        {/* Right Widget: SMS Payment Reminder Center */}
        <div className="lg:col-span-5 bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between mb-space-sm">
              <span className="font-headline-sm text-headline-sm text-on-surface">SMS Payment Reminder Center</span>
              <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-primary font-label-sm text-label-sm font-semibold">
                Telco Gateway Active
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
              Send automated bilingual Urdu &amp; English ledger payment reminders directly to farmers&apos; registered mobile phones.
            </p>

            {/* Notification Preview Box */}
            <div className="p-3.5 rounded-xl bg-surface-container-low border border-surface-container flex flex-col gap-2 mb-space-md">
              <div className="flex items-center justify-between text-outline font-label-sm text-label-sm">
                <span className="flex items-center gap-1 font-semibold text-on-surface">
                  <span className="material-symbols-outlined text-[16px] text-primary">chat</span>
                  Urdu SMS Khata Template
                </span>
                <span>Sender: PESTICIDE-CLUB</span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface bg-surface-container-lowest p-3 rounded-lg border border-surface-container font-mono text-right" dir="rtl">
                معزز کسان، پیسٹیسائیڈ کلب شاپ کی طرف سے آپ کا موجودہ کھاتہ بیلنس درج ذیل ہے۔ فصل کی کٹائی کے بعد براہ کرم اپنی ادائیگی مکمل فرمائیں۔ شکریہ!
              </p>
              <div className="flex items-center justify-between text-outline font-label-sm text-label-sm">
                <span>14 reminders due today (&gt;30 days)</span>
                <span className="text-secondary font-medium">99.8% SMS Delivery Rate</span>
              </div>
            </div>

            {/* Quick Reminder Stat Pills */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-lg bg-surface-container flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-primary">mark_chat_read</span>
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm text-outline">Sent this week</span>
                  <span className="font-label-md text-label-md font-bold text-on-surface">128 SMS</span>
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-surface-container flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-secondary">payments</span>
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm text-outline">Recovered Post-SMS</span>
                  <span className="font-label-md text-label-md font-bold text-secondary">Rs. 1.84M</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-space-md pt-space-sm flex items-center justify-between gap-space-sm border-t border-surface-container">
            <button
              className="h-10 px-space-md rounded-xl bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors font-label-md text-label-md cursor-pointer"
              onClick={() => showToast('Test SMS dispatched to shop owner mobile (+92 300 1234567)!')}
              type="button"
            >
              Test SMS
            </button>
            <button
              className="h-10 px-space-lg rounded-xl bg-primary text-on-primary hover:bg-primary-container transition-colors font-label-md text-label-md font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
              onClick={() => showToast('Bulk SMS dispatched to all 18 overdue farmers!')}
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">send</span>
              <span>Broadcast Overdue Notices</span>
            </button>
          </div>
        </div>
      </div>

      {/* Register New Farmer Slide-Over Modal */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-inverse-surface/40 backdrop-blur-xs transition-opacity duration-300">
          <div className="w-full max-w-xl h-full bg-surface-container-lowest shadow-2xl p-space-xl overflow-y-auto flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-space-md mb-space-lg border-b border-surface-container">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center">
                    <span className="material-symbols-outlined text-[22px]">person_add</span>
                  </div>
                  <div>
                    <h2 className="font-headline-md text-headline-md text-on-surface">Register New Farmer</h2>
                    <span className="font-body-sm text-body-sm text-outline">Open verified agricultural khata profile</span>
                  </div>
                </div>
                <button
                  className="w-8 h-8 rounded-lg bg-surface-container-low text-outline hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer"
                  onClick={() => setIsRegisterOpen(false)}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              <form className="space-y-space-md" onSubmit={handleRegisterFarmer}>
                <div>
                  <label className="block font-label-md text-label-md text-on-surface font-semibold mb-1">
                    Farmer Full Name *
                  </label>
                  <input
                    className="w-full h-10 px-3.5 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/20"
                    onChange={(e) => setNewFarmer({ ...newFarmer, name: e.target.value })}
                    placeholder="e.g. Chaudhry Riaz Ahmed"
                    required
                    type="text"
                    value={newFarmer.name}
                  />
                </div>

                <div className="grid grid-cols-2 gap-space-md">
                  <div>
                    <label className="block font-label-md text-label-md text-on-surface font-semibold mb-1">
                      CNIC Number *
                    </label>
                    <input
                      className="w-full h-10 px-3.5 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/20"
                      onChange={(e) => setNewFarmer({ ...newFarmer, cnic: e.target.value })}
                      placeholder="e.g. 33100-8492019-3"
                      required
                      type="text"
                      value={newFarmer.cnic}
                    />
                  </div>
                  <div>
                    <label className="block font-label-md text-label-md text-on-surface font-semibold mb-1">
                      Mobile Contact *
                    </label>
                    <input
                      className="w-full h-10 px-3.5 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/20"
                      onChange={(e) => setNewFarmer({ ...newFarmer, phone: e.target.value })}
                      placeholder="0300-8712394"
                      required
                      type="tel"
                      value={newFarmer.phone}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-space-md">
                  <div>
                    <label className="block font-label-md text-label-md text-on-surface font-semibold mb-1">
                      Village / Mouza
                    </label>
                    <input
                      className="w-full h-10 px-3.5 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/20"
                      onChange={(e) => setNewFarmer({ ...newFarmer, village: e.target.value })}
                      placeholder="e.g. Chak 42-RB"
                      type="text"
                      value={newFarmer.village}
                    />
                  </div>
                  <div>
                    <label className="block font-label-md text-label-md text-on-surface font-semibold mb-1">
                      Total Landholding (Acres)
                    </label>
                    <input
                      className="w-full h-10 px-3.5 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/20"
                      onChange={(e) => setNewFarmer({ ...newFarmer, acres: e.target.value })}
                      placeholder="e.g. 45"
                      type="number"
                      value={newFarmer.acres}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-space-md">
                  <div>
                    <label className="block font-label-md text-label-md text-on-surface font-semibold mb-1">
                      Major Crops
                    </label>
                    <input
                      className="w-full h-10 px-3.5 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/20"
                      onChange={(e) => setNewFarmer({ ...newFarmer, crops: e.target.value })}
                      placeholder="Wheat, Cotton, Sugarcane"
                      type="text"
                      value={newFarmer.crops}
                    />
                  </div>
                  <div>
                    <label className="block font-label-md text-label-md text-on-surface font-semibold mb-1">
                      Approved Credit Limit (PKR)
                    </label>
                    <input
                      className="w-full h-10 px-3.5 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/20"
                      onChange={(e) => setNewFarmer({ ...newFarmer, creditLimit: e.target.value })}
                      placeholder="300000"
                      type="number"
                      value={newFarmer.creditLimit}
                    />
                  </div>
                </div>

                <div className="pt-space-md mt-space-md flex items-center gap-space-sm justify-end border-t border-surface-container">
                  <button
                    className="h-11 px-space-lg rounded-xl bg-surface-container-high text-on-surface font-label-md text-label-md hover:bg-surface-container-highest transition-colors cursor-pointer"
                    onClick={() => setIsRegisterOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="h-11 px-space-xl rounded-xl bg-primary text-on-primary font-label-lg text-label-lg shadow-md hover:bg-primary-container transition-all flex items-center gap-2 cursor-pointer"
                    type="submit"
                  >
                    <span className="material-symbols-outlined text-[20px]">save</span>
                    <span>Save Farmer Profile</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomersPage;
