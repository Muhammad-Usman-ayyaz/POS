import React, { useState } from 'react';

interface ProductItem {
  id: number;
  name: string;
  chemical: string;
  packaging: string;
  type: string;
  sku: string;
  category: 'Insecticide' | 'Herbicide' | 'Fungicide' | 'Fertilizer' | 'PGR';
  brand: string;
  distributor: string;
  purchasePrice: number;
  sellingPrice: number;
  margin: string;
  stock: string;
  stockStatus: 'Healthy' | 'Low Stock' | 'Out of Stock';
  expiry: string;
  batch: string;
  status: 'Active' | 'Restock Pending';
  icon: string;
}

const PRODUCTS_DATA: ProductItem[] = [
  {
    id: 1,
    name: 'Coragen 20 SC',
    chemical: 'Chlorantraniliprole 18.5% w/w',
    packaging: '50ml',
    type: 'Liquid SC',
    sku: 'SKU-FMC-0492',
    category: 'Insecticide',
    brand: 'FMC Corporation',
    distributor: 'Distributor: Agri-Tech Ltd',
    purchasePrice: 1450,
    sellingPrice: 1850,
    margin: '+27.5%',
    stock: '145 Bottles',
    stockStatus: 'Healthy',
    expiry: 'Nov 2026',
    batch: 'Batch #FMC-890',
    status: 'Active',
    icon: 'science',
  },
  {
    id: 2,
    name: 'Belt 480 SC',
    chemical: 'Flubendiamide 480 g/L',
    packaging: '100ml',
    type: 'Suspension',
    sku: 'SKU-BAY-1102',
    category: 'Insecticide',
    brand: 'Bayer CropScience',
    distributor: 'Direct Import',
    purchasePrice: 2900,
    sellingPrice: 3550,
    margin: '+22.4%',
    stock: '52 Bottles',
    stockStatus: 'Healthy',
    expiry: 'Mar 2027',
    batch: 'Batch #BY-441',
    status: 'Active',
    icon: 'science',
  },
  {
    id: 3,
    name: 'Amistar Top',
    chemical: 'Azoxystrobin + Difenoconazole',
    packaging: '200ml',
    type: 'Liquid SC',
    sku: 'SKU-SYN-0881',
    category: 'Fungicide',
    brand: 'Syngenta Ag',
    distributor: 'Authorized Supply',
    purchasePrice: 2150,
    sellingPrice: 2680,
    margin: '+24.6%',
    stock: '8 Bottles',
    stockStatus: 'Low Stock',
    expiry: 'Jul 2025',
    batch: 'Batch #SN-129',
    status: 'Active',
    icon: 'spa',
  },
  {
    id: 4,
    name: 'Zorawar DAP',
    chemical: 'Nitrogen 18% + Phosphorus 46%',
    packaging: '50kg Bag',
    type: 'Granular',
    sku: 'SKU-ENG-9921',
    category: 'Fertilizer',
    brand: 'Engro Fertilizers',
    distributor: 'Factory Depo',
    purchasePrice: 10850,
    sellingPrice: 11400,
    margin: '+5.1%',
    stock: '320 Bags',
    stockStatus: 'Healthy',
    expiry: 'Dec 2028',
    batch: 'Lot #ENG-24',
    status: 'Active',
    icon: 'grain',
  },
  {
    id: 5,
    name: 'Target Glyphosate',
    chemical: 'Glyphosate 48% SL',
    packaging: '1 Litre',
    type: 'Herbicide SL',
    sku: 'SKU-AA-7013',
    category: 'Herbicide',
    brand: 'Ali Akbar Group',
    distributor: 'Regional Supply',
    purchasePrice: 950,
    sellingPrice: 1280,
    margin: '+34.7%',
    stock: '64 Cans',
    stockStatus: 'Healthy',
    expiry: 'Jan 2027',
    batch: 'Batch #AA-309',
    status: 'Active',
    icon: 'grass',
  },
  {
    id: 6,
    name: 'Match 050 EC',
    chemical: 'Lufenuron 50 g/L IGR',
    packaging: '250ml',
    type: 'Emulsifiable Con.',
    sku: 'SKU-SYN-0402',
    category: 'Insecticide',
    brand: 'Syngenta Ag',
    distributor: 'Authorized Supply',
    purchasePrice: 1600,
    sellingPrice: 2050,
    margin: '+28.1%',
    stock: '92 Bottles',
    stockStatus: 'Healthy',
    expiry: 'Aug 2026',
    batch: 'Batch #SN-882',
    status: 'Active',
    icon: 'science',
  },
  {
    id: 7,
    name: 'Nativo 75 WG',
    chemical: 'Tebuconazole + Trifloxystrobin',
    packaging: '100g',
    type: 'Water Granules',
    sku: 'SKU-BAY-0341',
    category: 'Fungicide',
    brand: 'Bayer CropScience',
    distributor: 'Direct Import',
    purchasePrice: 1780,
    sellingPrice: 2200,
    margin: '+23.6%',
    stock: '38 Packets',
    stockStatus: 'Healthy',
    expiry: 'Oct 2026',
    batch: 'Batch #BY-910',
    status: 'Active',
    icon: 'spa',
  },
  {
    id: 8,
    name: 'Engro Urea (Prilled)',
    chemical: 'Nitrogen 46% Total Fertilizer',
    packaging: '50kg Bag',
    type: 'White Granule',
    sku: 'SKU-ENG-1044',
    category: 'Fertilizer',
    brand: 'Engro Fertilizers',
    distributor: 'Factory Depo',
    purchasePrice: 3650,
    sellingPrice: 3900,
    margin: '+6.8%',
    stock: '450 Bags',
    stockStatus: 'Healthy',
    expiry: 'Dec 2028',
    batch: 'Lot #UR-2024',
    status: 'Active',
    icon: 'grain',
  },
  {
    id: 9,
    name: 'Karate 2.5 EC',
    chemical: 'Lambda-Cyhalothrin 25 g/L',
    packaging: '1 Litre',
    type: 'Pyrethroid',
    sku: 'SKU-SYN-0019',
    category: 'Insecticide',
    brand: 'Syngenta Ag',
    distributor: 'Authorized Supply',
    purchasePrice: 1820,
    sellingPrice: 2350,
    margin: '+29.1%',
    stock: '0 Litres',
    stockStatus: 'Out of Stock',
    expiry: 'Sep 2026',
    batch: 'Batch #SN-005',
    status: 'Restock Pending',
    icon: 'science',
  },
  {
    id: 10,
    name: 'Sitara 80 WDG',
    chemical: 'Elemental Sulfur 80% Tech',
    packaging: '10kg Drum',
    type: 'Water Dispersible',
    sku: 'SKU-AA-4482',
    category: 'Fungicide',
    brand: 'Ali Akbar Group',
    distributor: 'Regional Supply',
    purchasePrice: 3100,
    sellingPrice: 3850,
    margin: '+24.2%',
    stock: '24 Drums',
    stockStatus: 'Healthy',
    expiry: 'Feb 2027',
    batch: 'Batch #AA-881',
    status: 'Active',
    icon: 'spa',
  },
];

export const ProductsPage: React.FC = () => {
  const [products, setProducts] = useState<ProductItem[]>(PRODUCTS_DATA);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedStockStatus, setSelectedStockStatus] = useState('');
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Product Modal Form State
  const [newProduct, setNewProduct] = useState({
    name: '',
    chemical: '',
    category: 'Insecticide',
    brand: 'Bayer CropScience',
    sku: 'SKU-BAY-2024-X',
    packSize: '100',
    packUnit: 'ml',
    purchasePrice: '',
    sellingPrice: '',
    initialStock: '',
    expiryDate: '',
    batchNo: '',
  });

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedRows(products.map((p) => p.id));
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

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      searchQuery === '' ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.chemical.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.brand.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategory === '' || p.category === selectedCategory;
    const matchesBrand = selectedBrand === '' || p.brand.toLowerCase().includes(selectedBrand.toLowerCase());
    const matchesStock =
      selectedStockStatus === '' ||
      (selectedStockStatus === 'healthy' && p.stockStatus === 'Healthy') ||
      (selectedStockStatus === 'low' && p.stockStatus === 'Low Stock') ||
      (selectedStockStatus === 'out' && p.stockStatus === 'Out of Stock');

    return matchesSearch && matchesCategory && matchesBrand && matchesStock;
  });

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('');
    setSelectedBrand('');
    setSelectedStockStatus('');
  };

  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.name) return;

    const purchase = parseFloat(newProduct.purchasePrice) || 0;
    const selling = parseFloat(newProduct.sellingPrice) || 0;
    const marginPct = purchase > 0 ? (((selling - purchase) / purchase) * 100).toFixed(1) : '0.0';

    const created: ProductItem = {
      id: Date.now(),
      name: newProduct.name,
      chemical: newProduct.chemical || 'Standard formulation',
      packaging: `${newProduct.packSize}${newProduct.packUnit}`,
      type: 'Liquid / Powder',
      sku: newProduct.sku,
      category: newProduct.category as any,
      brand: newProduct.brand,
      distributor: 'Local Depot',
      purchasePrice: purchase,
      sellingPrice: selling,
      margin: `+${marginPct}%`,
      stock: `${newProduct.initialStock || 0} Units`,
      stockStatus: (parseFloat(newProduct.initialStock) || 0) > 10 ? 'Healthy' : 'Low Stock',
      expiry: newProduct.expiryDate || 'Dec 2026',
      batch: newProduct.batchNo || 'Batch #NEW-01',
      status: 'Active',
      icon: 'science',
    };

    setProducts([created, ...products]);
    setIsModalOpen(false);
    setNewProduct({
      name: '',
      chemical: '',
      category: 'Insecticide',
      brand: 'Bayer CropScience',
      sku: 'SKU-BAY-2024-X',
      packSize: '100',
      packUnit: 'ml',
      purchasePrice: '',
      sellingPrice: '',
      initialStock: '',
      expiryDate: '',
      batchNo: '',
    });
  };

  return (
    <div className="flex flex-col w-full gap-y-space-md">
      {/* Top Headline / Metrics & Action Summary Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md bg-surface-container-lowest p-space-lg rounded-xl shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-space-md">
          <div className="flex items-center gap-space-sm">
            <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[24px]">pest_control</span>
            </div>
            <div>
              <div className="flex items-center gap-space-xs">
                <h1 className="font-headline-lg text-headline-lg text-on-surface">Products Catalog</h1>
                <span className="px-space-xs py-0.5 rounded-full bg-surface-container text-primary font-label-sm text-label-sm">
                  {products.length} Registered
                </span>
              </div>
              <p className="font-body-sm text-body-sm text-outline">
                Manage active chemical formulations, technical batch rates, packaging specs, and inventory pricing.
              </p>
            </div>
          </div>

          <div className="hidden xl:flex items-center gap-space-sm pl-space-md bg-surface-container-low py-1.5 px-space-md rounded-lg">
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Total Value</span>
              <span className="font-currency-cell text-currency-cell text-on-surface">Rs. 4,892,400</span>
            </div>
            <div className="h-6 w-px bg-outline-variant/40 mx-space-xs"></div>
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Critical Alerts</span>
              <span className="font-currency-cell text-currency-cell text-error flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></span> 4 Low Stock
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-space-xs">
          <button
            className="h-[38px] px-space-md rounded-lg bg-surface-container-low text-on-surface hover:bg-surface-container-high transition-colors font-label-md text-label-md flex items-center gap-1.5 shadow-sm cursor-pointer"
            type="button"
            onClick={() => alert('Exporting Products Catalog to CSV...')}
          >
            <span className="material-symbols-outlined text-[18px] text-outline">file_download</span>
            <span>Export CSV</span>
          </button>
          <button
            className="h-[38px] px-space-md rounded-lg bg-surface-container-low text-on-surface hover:bg-surface-container-high transition-colors font-label-md text-label-md flex items-center gap-1.5 shadow-sm cursor-pointer"
            type="button"
            onClick={() => alert('Printing Product Barcodes...')}
          >
            <span className="material-symbols-outlined text-[18px] text-outline">barcode_scanner</span>
            <span>Print Barcodes</span>
          </button>
          <button
            className="h-[38px] px-space-md rounded-lg bg-primary-container text-on-primary hover:bg-primary transition-colors font-label-md text-label-md flex items-center gap-1.5 shadow-sm cursor-pointer"
            id="openNewProductBtn"
            type="button"
            onClick={() => setIsModalOpen(true)}
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            <span>+ Add New Product</span>
          </button>
        </div>
      </div>

      {/* Filtration & Global Discovery Toolbar */}
      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col gap-space-sm">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-space-sm">
          {/* Global Search */}
          <div className="md:col-span-5 relative flex items-center">
            <span className="material-symbols-outlined absolute left-3 text-outline text-[20px]">search</span>
            <input
              className="w-full h-[40px] pl-10 pr-10 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-sm text-body-sm focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container"
              id="productSearchInput"
              placeholder="Search by trade name, chemical formulation, SKU, brand, or manufacturer..."
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="absolute right-2.5 text-outline hover:text-on-surface p-1 cursor-pointer"
                title="Clear search"
                type="button"
                onClick={() => setSearchQuery('')}
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>

          {/* Category Filter */}
          <div className="md:col-span-2">
            <div className="relative">
              <select
                className="w-full h-[40px] appearance-none pl-3 pr-8 rounded-lg bg-surface-container-low text-on-surface font-label-md text-label-md focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="">All Categories</option>
                <option value="Insecticide">Insecticide</option>
                <option value="Herbicide">Herbicide</option>
                <option value="Fungicide">Fungicide</option>
                <option value="Fertilizer">Fertilizer &amp; Micronutrients</option>
                <option value="PGR">Plant Growth Regulators</option>
              </select>
              <span className="material-symbols-outlined absolute right-2.5 top-2.5 pointer-events-none text-outline text-[18px]">
                expand_more
              </span>
            </div>
          </div>

          {/* Brand / Manufacturer */}
          <div className="md:col-span-2">
            <div className="relative">
              <select
                className="w-full h-[40px] appearance-none pl-3 pr-8 rounded-lg bg-surface-container-low text-on-surface font-label-md text-label-md focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container"
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
              >
                <option value="">All Brands</option>
                <option value="FMC">FMC Corporation</option>
                <option value="Bayer">Bayer CropScience</option>
                <option value="Syngenta">Syngenta Ag</option>
                <option value="Engro">Engro Fertilizers</option>
                <option value="Ali Akbar">Ali Akbar Group</option>
                <option value="Corteva">Corteva Agriscience</option>
              </select>
              <span className="material-symbols-outlined absolute right-2.5 top-2.5 pointer-events-none text-outline text-[18px]">
                expand_more
              </span>
            </div>
          </div>

          {/* Stock Status */}
          <div className="md:col-span-2">
            <div className="relative">
              <select
                className="w-full h-[40px] appearance-none pl-3 pr-8 rounded-lg bg-surface-container-low text-on-surface font-label-md text-label-md focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container"
                value={selectedStockStatus}
                onChange={(e) => setSelectedStockStatus(e.target.value)}
              >
                <option value="">Stock: All</option>
                <option value="healthy">In Stock (Healthy)</option>
                <option value="low">Low Stock Alert (&lt; 20)</option>
                <option value="out">Out of Stock (0)</option>
              </select>
              <span className="material-symbols-outlined absolute right-2.5 top-2.5 pointer-events-none text-outline text-[18px]">
                expand_more
              </span>
            </div>
          </div>

          {/* Reset / Filter Controls */}
          <div className="md:col-span-1 flex items-center justify-end gap-1">
            <button
              className="h-[40px] w-full rounded-lg bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant flex items-center justify-center cursor-pointer"
              title="Reset Filters"
              type="button"
              onClick={handleResetFilters}
            >
              <span className="material-symbols-outlined text-[20px]">filter_alt_off</span>
            </button>
          </div>
        </div>

        {/* Active Filters Tag Strip */}
        <div className="flex items-center gap-space-xs pt-1 overflow-x-auto text-label-sm font-label-sm">
          <span className="text-outline uppercase tracking-wider text-[10px]">Active Filters:</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface">
            Category: {selectedCategory || 'All'}
            {selectedCategory && (
              <button className="hover:text-error flex items-center cursor-pointer" onClick={() => setSelectedCategory('')}>
                <span className="material-symbols-outlined text-[12px]">close</span>
              </button>
            )}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface">
            Status: Active Products
          </span>
          <button className="text-primary hover:underline ml-space-xs font-label-sm cursor-pointer" onClick={handleResetFilters}>
            Clear All
          </button>
        </div>
      </div>

      {/* Main Product Master Table Workspace */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-outline font-label-sm text-label-sm uppercase tracking-wider select-none">
                <th className="py-space-sm pl-space-md pr-space-xs w-10 text-center">
                  <input
                    className="rounded bg-surface-container-highest text-primary focus:ring-0 cursor-pointer"
                    type="checkbox"
                    checked={selectedRows.length === products.length && products.length > 0}
                    onChange={handleSelectAll}
                  />
                </th>
                <th className="py-space-sm px-space-sm min-w-[260px]">Product / Formulation</th>
                <th className="py-space-sm px-space-sm min-w-[130px]">SKU / Code</th>
                <th className="py-space-sm px-space-sm min-w-[120px]">Category</th>
                <th className="py-space-sm px-space-sm min-w-[140px]">Brand / Company</th>
                <th className="py-space-sm px-space-sm text-right min-w-[110px]">Purchase</th>
                <th className="py-space-sm px-space-sm text-right min-w-[110px]">Selling</th>
                <th className="py-space-sm px-space-sm text-right min-w-[90px]">Margin</th>
                <th className="py-space-sm px-space-sm text-right min-w-[130px]">Current Stock</th>
                <th className="py-space-sm px-space-sm min-w-[110px]">Expiry</th>
                <th className="py-space-sm px-space-sm min-w-[90px]">Status</th>
                <th className="py-space-sm pr-space-md pl-space-xs text-center min-w-[120px]">Actions</th>
              </tr>
            </thead>
            <tbody
              key={`${searchQuery}-${selectedCategory}-${selectedBrand}-${selectedStockStatus}`}
              className="divide-y divide-surface-container-low font-body-md text-body-md text-on-surface"
            >
              {filteredProducts.map((p, idx) => {
                const isSelected = selectedRows.includes(p.id);
                const isOutOfStock = p.stockStatus === 'Out of Stock';

                return (
                  <tr
                    key={p.id}
                    className={`table-row-enter hover:bg-surface-container-low/60 transition-colors group ${
                      isOutOfStock ? 'bg-error-container/10' : ''
                    }`}
                    style={{ animationDelay: `${Math.min(idx, 12) * 25}ms` }}
                  >
                    <td className="py-3 pl-space-md pr-space-xs text-center">
                      <input
                        className="rounded bg-surface-container text-primary focus:ring-0 cursor-pointer"
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSelectRow(p.id)}
                      />
                    </td>
                    <td className="py-3 px-space-sm">
                      <div className="flex items-center gap-space-sm">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                            isOutOfStock
                              ? 'bg-error-container/40 text-error'
                              : 'bg-surface-container text-primary'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[20px]">{p.icon}</span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-headline-sm text-headline-sm text-on-surface font-semibold truncate group-hover:text-primary transition-colors">
                            {p.name}
                          </span>
                          <span className="font-body-sm text-body-sm text-outline truncate">{p.chemical}</span>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="px-1.5 py-0.2 rounded bg-surface-container-high font-label-sm text-label-sm text-on-surface-variant">
                              {p.packaging}
                            </span>
                            <span className="font-label-sm text-label-sm text-outline">{p.type}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-space-sm">
                      <span className="font-mono font-label-md text-label-md text-on-surface-variant bg-surface-container-low px-2 py-1 rounded">
                        {p.sku}
                      </span>
                    </td>
                    <td className="py-3 px-space-sm">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-label-sm text-label-sm ${
                          p.category === 'Insecticide'
                            ? 'bg-primary-fixed text-on-primary-fixed-variant'
                            : p.category === 'Fertilizer'
                            ? 'bg-secondary-fixed text-on-secondary-fixed-variant font-semibold'
                            : p.category === 'Fungicide'
                            ? 'bg-tertiary-fixed text-on-tertiary-fixed font-semibold'
                            : 'bg-surface-container-highest text-primary font-semibold'
                        }`}
                      >
                        {p.category}
                      </span>
                    </td>
                    <td className="py-3 px-space-sm">
                      <span className="font-label-md text-label-md text-on-surface">{p.brand}</span>
                      <span className="block font-body-sm text-body-sm text-outline">{p.distributor}</span>
                    </td>
                    <td className="py-3 px-space-sm text-right">
                      <span className="font-currency-cell text-currency-cell text-outline">
                        Rs. {p.purchasePrice.toLocaleString()}
                      </span>
                    </td>
                    <td className="py-3 px-space-sm text-right">
                      <span className="font-currency-cell text-currency-cell text-on-surface font-bold">
                        Rs. {p.sellingPrice.toLocaleString()}
                      </span>
                    </td>
                    <td className="py-3 px-space-sm text-right">
                      <span className="font-label-md text-label-md text-secondary font-semibold">{p.margin}</span>
                    </td>
                    <td className="py-3 px-space-sm text-right">
                      <div className="flex flex-col items-end">
                        <span
                          className={`font-currency-cell text-currency-cell ${
                            p.stockStatus === 'Low Stock'
                              ? 'text-error font-bold'
                              : p.stockStatus === 'Out of Stock'
                              ? 'text-error font-bold'
                              : 'text-on-surface'
                          }`}
                        >
                          {p.stock}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-label-sm text-label-sm mt-0.5 ${
                            p.stockStatus === 'Healthy'
                              ? 'bg-secondary-fixed text-on-secondary-fixed'
                              : p.stockStatus === 'Low Stock'
                              ? 'bg-error-container text-on-error-container'
                              : 'bg-danger-soft text-danger'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              p.stockStatus === 'Healthy' ? 'bg-secondary' : 'bg-error'
                            }`}
                          ></span>{' '}
                          {p.stockStatus}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-space-sm">
                      <span className="font-label-md text-label-md text-on-surface">{p.expiry}</span>
                      <span className="block font-label-sm text-label-sm text-outline">{p.batch}</span>
                    </td>
                    <td className="py-3 px-space-sm">
                      <span
                        className={`px-2 py-0.5 rounded-full font-label-sm text-label-sm font-semibold inline-block ${
                          p.status === 'Active'
                            ? 'bg-success-soft text-success'
                            : 'bg-warning-soft text-warning'
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 pr-space-md pl-space-xs text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          className="w-8 h-8 rounded-lg hover:bg-surface-container-high text-outline hover:text-primary flex items-center justify-center transition-colors cursor-pointer"
                          title="Quick View"
                          type="button"
                          onClick={() => alert(`Viewing ${p.name} details`)}
                        >
                          <span className="material-symbols-outlined text-[18px]">visibility</span>
                        </button>
                        <button
                          className="w-8 h-8 rounded-lg hover:bg-surface-container-high text-outline hover:text-primary flex items-center justify-center transition-colors cursor-pointer"
                          title="Edit Formulation"
                          type="button"
                          onClick={() => alert(`Editing ${p.name}`)}
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button
                          className="w-8 h-8 rounded-lg hover:bg-surface-container-high text-outline hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer"
                          title="More Options"
                          type="button"
                        >
                          <span className="material-symbols-outlined text-[18px]">more_vert</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Table Footer & Rich Operational Pagination */}
        <div className="p-space-md bg-surface-container-lowest flex flex-col md:flex-row items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-md text-outline font-body-sm text-body-sm">
            <span>
              Showing <strong className="text-on-surface font-semibold">1 to {filteredProducts.length}</strong> of{' '}
              <strong className="text-on-surface font-semibold">248</strong> products
            </span>
            <div className="hidden sm:flex items-center gap-1.5">
              <span>Rows per page:</span>
              <select className="h-8 pl-2 pr-6 rounded bg-surface-container-low text-on-surface font-label-sm text-label-sm focus:outline-none">
                <option>10</option>
                <option>25</option>
                <option>50</option>
                <option>100</option>
              </select>
            </div>
          </div>

          {/* Page Numbers Navigation */}
          <div className="flex items-center gap-1">
            <button
              className="h-8 px-2.5 rounded-lg bg-surface-container-low text-outline opacity-50 cursor-not-allowed flex items-center justify-center"
              disabled
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
              <span className="hidden sm:inline font-label-md text-label-md pr-1">Prev</span>
            </button>
            <button
              className="h-8 w-8 rounded-lg bg-primary-container text-on-primary font-label-md text-label-md flex items-center justify-center shadow-sm cursor-pointer"
              type="button"
            >
              1
            </button>
            <button
              className="h-8 w-8 rounded-lg hover:bg-surface-container-high text-on-surface font-label-md text-label-md flex items-center justify-center transition-colors cursor-pointer"
              type="button"
            >
              2
            </button>
            <button
              className="h-8 w-8 rounded-lg hover:bg-surface-container-high text-on-surface font-label-md text-label-md flex items-center justify-center transition-colors cursor-pointer"
              type="button"
            >
              3
            </button>
            <span className="px-1 text-outline">...</span>
            <button
              className="h-8 w-8 rounded-lg hover:bg-surface-container-high text-on-surface font-label-md text-label-md flex items-center justify-center transition-colors cursor-pointer"
              type="button"
            >
              25
            </button>
            <button
              className="h-8 px-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container-high text-on-surface flex items-center justify-center transition-colors cursor-pointer"
              type="button"
            >
              <span className="hidden sm:inline font-label-md text-label-md pl-1">Next</span>
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      {/* Operational Insights Bento: Quick Technical Statuses */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
        {/* Fast Inventory Turnover */}
        <div className="erp-stagger-item erp-stagger-1 bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex items-start gap-space-sm erp-card-hover">
          <div className="w-10 h-10 rounded-lg bg-secondary-fixed/40 text-on-secondary-fixed-variant flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[20px]">trending_up</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
              Fastest Movement (Season Wheat)
            </span>
            <span className="font-headline-sm text-headline-sm text-on-surface mt-0.5">Engro Zorawar DAP &amp; Coragen</span>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Average shelf depletion rate is 4.8 days per batch cycle.
            </p>
          </div>
        </div>

        {/* Margin Health Card */}
        <div className="erp-stagger-item erp-stagger-2 bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex items-start gap-space-sm erp-card-hover">
          <div className="w-10 h-10 rounded-lg bg-primary-fixed text-primary flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
              Catalog Weighted Margin
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="font-currency-stat text-currency-stat text-primary">23.8%</span>
              <span className="font-label-sm text-label-sm text-secondary font-semibold">+1.4% vs last quarter</span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Specialty fungicides maintain highest profitability margins.
            </p>
          </div>
        </div>

        {/* Expiry Risk Alert Widget */}
        <div className="erp-stagger-item erp-stagger-3 bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex items-start gap-space-sm erp-card-hover">
          <div className="w-10 h-10 rounded-lg bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[20px]">event_busy</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
              Batches Under Inspection
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="font-headline-sm text-headline-sm text-tertiary">3 Formulations</span>
              <span className="font-label-sm text-label-sm text-outline">Expiring &lt; 180 days</span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Recommend promotional discount or vendor replacement request.
            </p>
          </div>
        </div>
      </div>

      {/* Slide-Over / Modal Panel: Add New Product Master Entry */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop Scrim */}
          <div
            className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-sm animate-fade-in-up"
            style={{ animationDuration: '200ms' }}
            onClick={() => setIsModalOpen(false)}
          ></div>

          {/* Slide-Over Drawer Container */}
          <div className="relative w-screen max-w-xl glass-modal shadow-2xl flex flex-col justify-between overflow-y-auto z-10 erp-animate-drawer">
            <div>
              {/* Header */}
              <div className="p-space-lg bg-surface-container-low flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <div className="w-9 h-9 rounded-lg bg-primary-container text-on-primary flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">add_box</span>
                  </div>
                  <div>
                    <h2 className="font-headline-md text-headline-md text-on-surface">Add New Product Master</h2>
                    <span className="font-body-sm text-body-sm text-outline">
                      Register formulation, SKU code, tax structure, and retail rates
                    </span>
                  </div>
                </div>
                <button
                  className="w-8 h-8 rounded-lg hover:bg-surface-container-high text-outline hover:text-on-surface flex items-center justify-center cursor-pointer"
                  onClick={() => setIsModalOpen(false)}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {/* Form Content */}
              <form onSubmit={handleAddProduct} className="p-space-lg flex flex-col gap-space-md" id="newProductForm">
                <div className="grid grid-cols-2 gap-space-md">
                  <div className="col-span-2">
                    <label className="block font-label-md text-label-md text-on-surface mb-1">
                      Commercial Trade Name <span className="text-error">*</span>
                    </label>
                    <input
                      className="w-full h-[38px] px-3 rounded bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary-container"
                      placeholder="e.g. Belt Expert 480 SC"
                      required
                      type="text"
                      value={newProduct.name}
                      onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block font-label-md text-label-md text-on-surface mb-1">
                      Active Chemical Formulation / Ingredients
                    </label>
                    <input
                      className="w-full h-[38px] px-3 rounded bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary-container"
                      placeholder="e.g. Flubendiamide + Thiacloprid 480 SC"
                      type="text"
                      value={newProduct.chemical}
                      onChange={(e) => setNewProduct({ ...newProduct, chemical: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block font-label-md text-label-md text-on-surface mb-1">
                      Category <span className="text-error">*</span>
                    </label>
                    <select
                      className="w-full h-[38px] px-3 rounded bg-surface-container-low text-on-surface font-label-md text-label-md focus:outline-none focus:ring-2 focus:ring-primary-container"
                      value={newProduct.category}
                      onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                    >
                      <option>Insecticide</option>
                      <option>Herbicide</option>
                      <option>Fungicide</option>
                      <option>Fertilizer</option>
                      <option>Plant Growth Regulator</option>
                      <option>Bio-Stimulant</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-label-md text-label-md text-on-surface mb-1">
                      Manufacturer / Brand <span className="text-error">*</span>
                    </label>
                    <select
                      className="w-full h-[38px] px-3 rounded bg-surface-container-low text-on-surface font-label-md text-label-md focus:outline-none focus:ring-2 focus:ring-primary-container"
                      value={newProduct.brand}
                      onChange={(e) => setNewProduct({ ...newProduct, brand: e.target.value })}
                    >
                      <option>Bayer CropScience</option>
                      <option>FMC Corporation</option>
                      <option>Syngenta Ag</option>
                      <option>Engro Fertilizers</option>
                      <option>Ali Akbar Group</option>
                      <option>Kanzo AG</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-label-md text-label-md text-on-surface mb-1">SKU / Master Code</label>
                    <input
                      className="w-full h-[38px] px-3 rounded bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary-container"
                      type="text"
                      value={newProduct.sku}
                      onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block font-label-md text-label-md text-on-surface mb-1">
                      Packaging / Unit Size
                    </label>
                    <div className="flex gap-1">
                      <input
                        className="w-2/3 h-[38px] px-3 rounded bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary-container"
                        placeholder="100"
                        type="text"
                        value={newProduct.packSize}
                        onChange={(e) => setNewProduct({ ...newProduct, packSize: e.target.value })}
                      />
                      <select
                        className="w-1/3 h-[38px] px-2 rounded bg-surface-container-low text-on-surface font-label-md text-label-md focus:outline-none"
                        value={newProduct.packUnit}
                        onChange={(e) => setNewProduct({ ...newProduct, packUnit: e.target.value })}
                      >
                        <option>ml</option>
                        <option>Litre</option>
                        <option>gm</option>
                        <option>kg</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Financial Pricing Block */}
                <div className="mt-2 p-space-md bg-surface-container-low/60 rounded-xl flex flex-col gap-space-sm border border-outline-variant/30">
                  <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider font-semibold">
                    Pricing &amp; Initial Inventory
                  </span>
                  <div className="grid grid-cols-2 gap-space-sm">
                    <div>
                      <label className="block font-label-sm text-label-sm text-on-surface mb-1">
                        Purchase Cost Rate (Rs.)
                      </label>
                      <input
                        className="w-full h-[36px] px-3 rounded bg-surface-container-lowest text-on-surface font-currency-cell text-currency-cell focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="e.g. 1500"
                        type="number"
                        value={newProduct.purchasePrice}
                        onChange={(e) => setNewProduct({ ...newProduct, purchasePrice: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block font-label-sm text-label-sm text-on-surface mb-1">
                        Retail MRP Rate (Rs.)
                      </label>
                      <input
                        className="w-full h-[36px] px-3 rounded bg-surface-container-lowest text-on-surface font-currency-cell text-currency-cell focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="e.g. 1950"
                        type="number"
                        value={newProduct.sellingPrice}
                        onChange={(e) => setNewProduct({ ...newProduct, sellingPrice: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block font-label-sm text-label-sm text-on-surface mb-1">Opening Quantity</label>
                      <input
                        className="w-full h-[36px] px-3 rounded bg-surface-container-lowest text-on-surface font-body-sm text-body-sm focus:outline-none"
                        placeholder="e.g. 50"
                        type="number"
                        value={newProduct.initialStock}
                        onChange={(e) => setNewProduct({ ...newProduct, initialStock: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block font-label-sm text-label-sm text-on-surface mb-1">Batch / Lot Number</label>
                      <input
                        className="w-full h-[36px] px-3 rounded bg-surface-container-lowest text-on-surface font-body-sm text-body-sm focus:outline-none"
                        placeholder="e.g. B24-889"
                        type="text"
                        value={newProduct.batchNo}
                        onChange={(e) => setNewProduct({ ...newProduct, batchNo: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block font-label-sm text-label-sm text-on-surface mb-1">Expiry Date</label>
                      <input
                        className="w-full h-[36px] px-3 rounded bg-surface-container-lowest text-on-surface font-body-sm text-body-sm focus:outline-none"
                        placeholder="e.g. Nov 2026"
                        type="text"
                        value={newProduct.expiryDate}
                        onChange={(e) => setNewProduct({ ...newProduct, expiryDate: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="pt-4 flex items-center justify-end gap-space-sm border-t border-surface-container-low mt-2">
                  <button
                    className="h-10 px-space-md rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md cursor-pointer"
                    onClick={() => setIsModalOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="h-10 px-space-lg rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md shadow-sm cursor-pointer"
                    type="submit"
                  >
                    Save Product Master
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

export default ProductsPage;
