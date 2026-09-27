import React, { useState, useEffect, useRef } from 'react';
import { useBump } from '@/components/ui/animation';
import { notify } from '@/lib/notify';

interface CartItem {
  id: number;
  name: string;
  brand: string;
  batch: string;
  price: number;
  qty: number;
}

interface Product {
  id: number;
  name: string;
  chemical: string;
  brand: string;
  stock: string;
  batch: string;
  expiry: string;
  price: number;
  category: string;
  isLowStock?: boolean;
}

const INITIAL_PRODUCTS: Product[] = [
  {
    id: 1,
    name: 'Confidor 200 SL',
    chemical: 'Imidacloprid 200g/L Systemic • 250ml Liquid',
    brand: 'Bayer CropScience',
    stock: '48 pkts',
    batch: 'Batch #B23-9',
    expiry: 'Dec 2025',
    price: 1650,
    category: 'Insecticide',
  },
  {
    id: 2,
    name: 'SOP Potassium Sulphate',
    chemical: 'K2O 50% Granular Bag • 50kg Net Weight',
    brand: 'Engro Fertilizers',
    stock: '22 bags',
    batch: 'Batch #ENG-99',
    expiry: 'N/A Fresh',
    price: 12800,
    category: 'Fertilizer',
  },
  {
    id: 3,
    name: 'Belt Expert 480 SC',
    chemical: 'Flubendiamide + Thiacloprid • 100ml Pack',
    brand: 'Bayer / FMC',
    stock: '34 btls',
    batch: 'Batch #BE-48',
    expiry: 'Mar 2026',
    price: 3150,
    category: 'Insecticide',
  },
  {
    id: 4,
    name: 'Roundup 480 SL',
    chemical: 'Glyphosate Isopropylamine 48% • 1 Litre Bottle',
    brand: 'Monsanto / Bayer',
    stock: '15 btls',
    batch: 'Batch #RD-110',
    expiry: 'Oct 2025',
    price: 2400,
    category: 'Herbicide',
    isLowStock: true,
  },
  {
    id: 5,
    name: 'Voliam Flexi 300 SC',
    chemical: 'Chlorantraniliprole + Thiamethoxam • 80ml Pack',
    brand: 'Syngenta',
    stock: '60 pkts',
    batch: 'Batch #SYN-84',
    expiry: 'Jan 2026',
    price: 2850,
    category: 'Insecticide',
  },
  {
    id: 6,
    name: 'Zinc Sulphate 33%',
    chemical: 'Agricultural Chelate Grade • 10kg Bucket',
    brand: 'Swat Agro',
    stock: '19 cans',
    batch: 'Batch #ZN-332',
    expiry: 'Aug 2026',
    price: 4600,
    category: 'Fertilizer',
  },
];

export const POSPage: React.FC = () => {
  const [cartItems, setCartItems] = useState<CartItem[]>([
    { id: 1, name: 'SOP Potassium Sulphate 50kg', brand: 'Engro Fertilizers', batch: '#ENG-99', price: 12800, qty: 1 },
    { id: 2, name: 'Confidor 200 SL (250ml)', brand: 'Bayer CropScience', batch: '#B23-9', price: 1650, qty: 2 },
    { id: 3, name: 'Voliam Flexi 300 SC (80ml)', brand: 'Syngenta', batch: '#SYN-84', price: 2850, qty: 3 },
  ]);

  const [searchQuery, setSearchQuery] = useState('Confidor');
  const [selectedCategory, setSelectedCategory] = useState('All Inventory');
  const [discount, setDiscount] = useState<number>(650);
  const [cashReceived, setCashReceived] = useState<number>(25000);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank' | 'easypaisa' | 'jazzcash' | 'khata'>('cash');

  const skuInputRef = useRef<HTMLInputElement>(null);

  const categories = [
    'All Inventory',
    'Insecticides (Kera)',
    'Weedicides / Herbicides',
    'Fungicides (Ulli)',
    'Fertilizers & Zinc',
    'Hybrid Seeds',
  ];

  const filteredProducts = INITIAL_PRODUCTS.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.chemical.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.brand.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (selectedCategory === 'All Inventory') return true;
    if (selectedCategory.includes('Insecticides') && product.category === 'Insecticide') return true;
    if (selectedCategory.includes('Weedicides') && product.category === 'Herbicide') return true;
    if (selectedCategory.includes('Fertilizers') && product.category === 'Fertilizer') return true;
    return true;
  });

  const subtotal = cartItems.reduce((acc, curr) => acc + curr.price * curr.qty, 0);
  const totalItemCount = cartItems.reduce((acc, curr) => acc + curr.qty, 0);
  const netPayable = Math.max(0, subtotal - (discount || 0));
  const changeDue = (cashReceived || 0) - netPayable;

  const cartCountBump = useBump(cartItems.length);
  const totalItemBump = useBump(totalItemCount);
  const netPayableBump = useBump(netPayable);

  const showToast = (msg: string) => notify(msg, 1500);

  const addToCart = (product: Product) => {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.name === product.name);
      if (existing) {
        return prev.map((item) =>
          item.name === product.name ? { ...item, qty: item.qty + 1 } : item
        );
      } else {
        return [
          ...prev,
          {
            id: Date.now(),
            name: product.name,
            brand: product.brand,
            batch: product.batch,
            price: product.price,
            qty: 1,
          },
        ];
      }
    });
    showToast(`Added 1x ${product.name}`);
  };

  const updateQty = (id: number, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.qty + delta;
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeItem = (id: number) => {
    setCartItems((prev) => prev.filter((item) => item.id !== id));
  };

  const clearCart = () => {
    if (window.confirm('Clear all items from active cart?')) {
      setCartItems([]);
    }
  };

  const handleCompleteSale = () => {
    if (cartItems.length === 0) {
      alert('Cannot complete an empty sale. Please scan or add items.');
      return;
    }
    alert(
      `Sale Completed!\nAmount: Rs. ${netPayable.toLocaleString()}\nMethod: ${paymentMethod.toUpperCase()}\nCustomer: Choudhry Riaz Ahmed\nBill printed to Thermal Receipt Printer POS-01.`
    );
    setCartItems([]);
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        skuInputRef.current?.focus();
      } else if (e.key === 'F8') {
        e.preventDefault();
        handleCompleteSale();
      } else if (e.key === 'F4') {
        e.preventDefault();
        alert('Sale bill placed on Hold #HLD-401');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <div className="flex flex-col w-full">

      {/* POS Top Auxiliary Status & Short Bar */}
      <div className="flex flex-wrap items-center justify-between gap-space-sm mb-space-md">
        <div className="flex items-center gap-space-sm">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-on-primary shadow-sm">
            <span className="material-symbols-outlined text-[20px]">point_of_sale</span>
          </div>
          <div>
            <div className="flex items-center gap-space-xs">
              <span className="font-headline-sm text-headline-sm text-on-surface">Terminal POS-01</span>
              <span className="px-2 py-0.5 rounded-full bg-secondary/15 text-secondary font-label-sm text-label-sm uppercase font-semibold">
                Active Session #942
              </span>
            </div>
            <span className="font-label-sm text-label-sm text-outline">
              Counter Cashier: Tariq Mehmood • Main Warehouse Stock
            </span>
          </div>
        </div>

        {/* Live Metrics Strip */}
        <div className="flex items-center gap-space-md">
          <div className="hidden xl:flex items-center gap-space-md bg-surface-container-lowest px-space-md py-1.5 rounded-xl shadow-sm">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-secondary"></span>
              <span className="font-label-sm text-label-sm text-outline">
                Drawer: <strong className="text-on-surface">Rs. 84,200</strong>
              </span>
            </div>
            <div className="h-4 w-px bg-surface-container-high"></div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-primary">receipt_long</span>
              <span className="font-label-sm text-label-sm text-outline">
                Invoices Today: <strong className="text-on-surface">38</strong>
              </span>
            </div>
            <div className="h-4 w-px bg-surface-container-high"></div>
            <div className="flex items-center gap-1.5 text-secondary">
              <span className="material-symbols-outlined text-[16px]">sync</span>
              <span className="font-label-sm text-label-sm font-semibold">Offline-Ready (Synced)</span>
            </div>
          </div>
          <button
            className="h-9 px-space-md rounded-lg bg-surface-container-low text-on-surface font-label-md text-label-md flex items-center gap-1.5 hover:bg-surface-container transition-colors shadow-sm cursor-pointer"
            type="button"
            onClick={() => alert('Recent Slips: INV-1092, INV-1091, INV-1090')}
          >
            <span className="material-symbols-outlined text-[18px]">history</span>
            <span>Recent Slips [F2]</span>
          </button>
          <button
            className="h-9 px-space-md rounded-lg bg-surface-container-low text-error font-label-md text-label-md flex items-center gap-1.5 hover:bg-error-container/40 transition-colors shadow-sm cursor-pointer"
            type="button"
            onClick={() => alert('Recall bill clicked: 3 bills on hold')}
          >
            <span className="material-symbols-outlined text-[18px]">pause_circle</span>
            <span>Recall Bill (3)</span>
          </button>
        </div>
      </div>

      {/* Main POS Grid (60% / 40% Desktop Split) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-lg items-start">
        {/* LEFT PANEL: Catalog, Filtering & Fast Entry (Col 1-7) */}
        <section className="lg:col-span-7 flex flex-col gap-space-md">
          {/* Search, SKU Barcode Scanner Bar */}
          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col gap-space-sm">
            <div className="flex items-center gap-space-sm">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-primary text-[20px]">
                  barcode_scanner
                </span>
                <input
                  ref={skuInputRef}
                  className="w-full h-11 pl-11 pr-24 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest shadow-inner"
                  id="skuInput"
                  placeholder="Scan barcode [F3] or search product, salt formulation, brand (e.g. Imidacloprid, Bayer)..."
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm">
                    Ctrl+K
                  </span>
                </div>
              </div>
              <button
                className="h-11 px-space-md rounded-lg bg-primary-fixed text-on-primary-fixed-variant font-label-md text-label-md flex items-center gap-2 hover:bg-primary-fixed-dim transition-colors shrink-0 cursor-pointer"
                id="toggleScannerBtn"
                type="button"
                onClick={() => {
                  skuInputRef.current?.focus();
                  showToast('Laser Auto-Scan Active');
                }}
              >
                <span className="material-symbols-outlined text-[20px]">qr_code_scanner</span>
                <span className="hidden sm:inline">Laser Auto-Scan</span>
                <span className="w-2 h-2 rounded-full bg-secondary animate-ping"></span>
              </button>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-space-xs overflow-x-auto pb-1 pt-1 scrollbar-none">
              {categories.map((cat) => (
                <button
                  key={cat}
                  className={`px-space-md py-1.5 rounded-full font-label-sm text-label-sm shrink-0 transition-all duration-150 erp-btn-press cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-primary text-on-primary font-semibold shadow-xs'
                      : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                  }`}
                  onClick={() => setSelectedCategory(cat)}
                  type="button"
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Active Search Results & Fast Product Cards Grid Header */}
          <div className="flex items-center justify-between px-space-xs">
            <span className="font-label-md text-label-md text-on-surface-variant">
              Showing <strong>{filteredProducts.length}</strong> fast-moving products
            </span>
            <div className="flex items-center gap-space-xs">
              <span className="font-label-sm text-label-sm text-outline">View:</span>
              <button
                className="w-7 h-7 rounded bg-surface-container-high flex items-center justify-center text-primary erp-btn-press"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">grid_view</span>
              </button>
              <button
                className="w-7 h-7 rounded bg-surface-container-low flex items-center justify-center text-outline hover:text-on-surface erp-btn-press transition-colors"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">view_list</span>
              </button>
            </div>
          </div>

          {/* Product Cards Grid */}
          <div
            key={`${selectedCategory}-${searchQuery}`}
            className="grid grid-cols-1 sm:grid-cols-2 gap-space-md"
          >
            {filteredProducts.map((product, idx) => (
              <div
                key={product.id}
                className={`erp-stagger-item erp-stagger-${Math.min(idx + 1, 8)} bg-surface-container-lowest p-space-md rounded-xl shadow-xs flex flex-col justify-between erp-card-hover group relative overflow-hidden border border-transparent hover:border-primary/20`}
              >
                <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-primary/5 rounded-full pointer-events-none group-hover:scale-125 transition-transform duration-300 ease-out"></div>
                <div>
                  <div className="flex items-start justify-between gap-space-xs mb-1.5">
                    <span
                      className={`px-2 py-0.5 rounded-md font-label-sm text-label-sm font-semibold transition-colors ${
                        product.brand.includes('Bayer')
                          ? 'bg-primary-fixed text-on-primary-fixed-variant'
                          : product.brand.includes('Syngenta')
                          ? 'bg-secondary/15 text-secondary'
                          : product.brand.includes('FMC')
                          ? 'bg-tertiary-fixed text-on-tertiary-fixed-variant'
                          : 'bg-surface-container-high text-on-surface-variant'
                      }`}
                    >
                      {product.brand}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md font-label-sm text-label-sm font-semibold ${
                        product.isLowStock
                          ? 'bg-tertiary-fixed text-on-tertiary-fixed-variant'
                          : 'bg-secondary/10 text-secondary'
                      }`}
                    >
                      Stock: {product.stock}
                    </span>
                  </div>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold group-hover:text-primary transition-colors duration-150">
                    {product.name}
                  </h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-1">{product.chemical}</p>
                  <div className="flex items-center gap-space-xs text-outline font-label-sm text-label-sm mt-2">
                    <span className="bg-surface-container-low px-1.5 py-0.5 rounded">{product.batch}</span>
                    <span>•</span>
                    <span className="text-on-surface-variant">Exp: {product.expiry}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 flex items-center justify-between bg-surface-container-low/50 -mx-space-md -mb-space-md px-space-md py-space-sm rounded-b-xl">
                  <div>
                    <span className="font-label-sm text-label-sm text-outline block leading-none">Retail MRP</span>
                    <span className="font-currency-stat text-currency-stat text-primary font-bold">
                      Rs. {product.price.toLocaleString()}
                    </span>
                  </div>
                  <button
                    className="h-9 px-space-md rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md flex items-center gap-1.5 shadow-sm erp-btn-press active:scale-95 transition-all cursor-pointer"
                    onClick={() => addToCart(product)}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">add_shopping_cart</span>
                    <span>Add</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Action Keyboard Reference Guide Footer */}
          <div className="bg-surface-container-low p-space-sm rounded-xl flex items-center justify-between text-outline font-label-sm text-label-sm overflow-x-auto">
            <div className="flex items-center gap-space-md shrink-0">
              <span>
                <kbd className="px-1.5 py-0.5 bg-surface-container-lowest text-on-surface rounded shadow-sm font-semibold">
                  F2
                </kbd>{' '}
                Recent Slips
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 bg-surface-container-lowest text-on-surface rounded shadow-sm font-semibold">
                  F3
                </kbd>{' '}
                Scan Focus
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 bg-surface-container-lowest text-on-surface rounded shadow-sm font-semibold">
                  F4
                </kbd>{' '}
                Hold Bill
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 bg-surface-container-lowest text-on-surface rounded shadow-sm font-semibold">
                  F7
                </kbd>{' '}
                Khata Lookup
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 bg-surface-container-lowest text-on-surface rounded shadow-sm font-semibold">
                  F8 / Enter
                </kbd>{' '}
                Checkout
              </span>
            </div>
            <span className="text-primary font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">electric_bolt</span> Fast Counter v2.4
            </span>
          </div>
        </section>

        {/* RIGHT PANEL: Active Cart & Farmer Ledger Checkout (Col 8-12) */}
        <aside className="lg:col-span-5 flex flex-col gap-space-sm">
          {/* Customer / Farmer Selector Card with Khata Status Badge */}
          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm">
            <div className="flex items-center justify-between mb-space-xs">
              <label className="font-label-sm text-label-sm uppercase tracking-wider text-outline font-semibold">
                Farmer / Buyer Profile
              </label>
              <button
                className="text-primary hover:underline font-label-sm text-label-sm flex items-center gap-1 font-semibold cursor-pointer"
                type="button"
                onClick={() => alert('New Farmer Registration Modal')}
              >
                <span className="material-symbols-outlined text-[14px]">person_add</span> New Farmer
              </button>
            </div>
            <div className="relative mb-2.5">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">
                search
              </span>
              <input
                className="w-full h-10 pl-9 pr-9 rounded-lg bg-surface-container-low text-on-surface font-label-md text-label-md focus:outline-none focus:bg-surface-container-lowest font-medium"
                defaultValue="Choudhry Riaz Ahmed • Chak 42-RB"
                type="text"
              />
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface cursor-pointer" type="button">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Khata Ledger Financial Status Pill */}
            <div className="bg-primary/5 rounded-lg p-space-sm flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-secondary"></span>
                  <span className="font-label-sm text-label-sm text-on-surface font-semibold">
                    Khata Ledger Active
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-secondary/20 text-secondary font-bold">
                    Good Standing
                  </span>
                </div>
                <span className="font-label-sm text-label-sm text-outline">CNIC: 33100-8492019-3</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-left pt-1">
                <div className="bg-surface-container-lowest/80 p-1.5 rounded">
                  <span className="text-[11px] text-outline block leading-none">Net Khata Due</span>
                  <span className="font-currency-cell text-currency-cell text-error font-bold">Rs. 145,000</span>
                </div>
                <div className="bg-surface-container-lowest/80 p-1.5 rounded">
                  <span className="text-[11px] text-outline block leading-none">Credit Limit</span>
                  <span className="font-currency-cell text-currency-cell text-primary font-bold">Rs. 300,000</span>
                </div>
              </div>
            </div>
          </div>

          {/* Live Cart Container */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm flex flex-col overflow-hidden">
            {/* Cart Table Header */}
            <div className="px-space-md py-2.5 bg-surface-container-low flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">Current Bill Items</span>
                <span
                  className={`w-5 h-5 rounded-full bg-primary text-on-primary text-[11px] font-bold flex items-center justify-center ${
                    cartCountBump ? 'erp-animate-bump' : ''
                  }`}
                >
                  {cartItems.length}
                </span>
              </div>
              <button
                className="text-outline hover:text-error font-label-sm text-label-sm flex items-center gap-1 transition-colors cursor-pointer"
                onClick={clearCart}
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
                <span>Clear</span>
              </button>
            </div>

            {/* Cart Items Scroll Area */}
            <div className="flex flex-col divide-y-0 max-h-[260px] overflow-y-auto px-space-md py-space-xs">
              {cartItems.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-outline">
                  <span className="material-symbols-outlined text-[40px] mb-2 opacity-40">remove_shopping_cart</span>
                  <p className="font-label-md text-label-md">Cart is currently empty</p>
                  <span className="font-body-sm text-body-sm">Scan barcode or pick items from left catalog</span>
                </div>
              ) : (
                cartItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`erp-cart-item-enter py-space-sm flex items-center justify-between gap-space-sm transition-all ${
                      idx % 2 === 1 ? 'bg-surface-container-low/40 rounded-lg px-2 -mx-2' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="font-label-md text-label-md text-on-surface font-semibold truncate">{item.name}</h4>
                      <div className="flex items-center gap-space-xs text-outline font-label-sm text-label-sm">
                        <span>{item.brand}</span>
                        <span>•</span>
                        <span>{item.batch}</span>
                      </div>
                      <span className="text-primary font-currency-cell text-currency-cell sm:hidden">
                        Rs. {item.price.toLocaleString()}
                      </span>
                    </div>

                    {/* Quantity Spinner */}
                    <div className="flex items-center gap-1 bg-surface-container-low rounded-lg p-0.5 shrink-0">
                      <button
                        className="w-7 h-7 rounded bg-surface-container-lowest text-on-surface font-bold flex items-center justify-center hover:bg-surface-container erp-btn-press active:scale-90 shadow-xs cursor-pointer"
                        onClick={() => updateQty(item.id, -1)}
                        type="button"
                      >
                        -
                      </button>
                      <span className="w-7 text-center font-currency-cell text-currency-cell font-bold text-on-surface select-none">
                        {item.qty}
                      </span>
                      <button
                        className="w-7 h-7 rounded bg-surface-container-lowest text-on-surface font-bold flex items-center justify-center hover:bg-surface-container erp-btn-press active:scale-90 shadow-xs cursor-pointer"
                        onClick={() => updateQty(item.id, 1)}
                        type="button"
                      >
                        +
                      </button>
                    </div>

                    {/* Price & Remove */}
                    <div className="text-right shrink-0 min-w-[80px]">
                      <span className="font-currency-cell text-currency-cell text-on-surface font-bold block">
                        Rs. {(item.price * item.qty).toLocaleString()}
                      </span>
                      <button
                        className="text-outline hover:text-error text-label-sm flex items-center gap-0.5 ml-auto pt-0.5 cursor-pointer erp-btn-press"
                        onClick={() => removeItem(item.id)}
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Financial Summary Calculation Area */}
            <div className="bg-surface-container-low p-space-md flex flex-col gap-space-xs">
              <div className="flex justify-between items-center text-on-surface-variant font-body-sm text-body-sm">
                <span className={totalItemBump ? 'erp-animate-bump inline-block' : 'inline-block'}>
                  Subtotal ({totalItemCount} items)
                </span>
                <span className="font-currency-cell text-currency-cell text-on-surface font-semibold">
                  Rs. {subtotal.toLocaleString()}
                </span>
              </div>

              <div className="flex justify-between items-center text-on-surface-variant font-body-sm text-body-sm">
                <div className="flex items-center gap-2">
                  <span>Special Counter Discount</span>
                  <span className="px-1.5 py-0.2 rounded bg-tertiary-fixed text-on-tertiary-fixed text-[11px] font-semibold">
                    Manual
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-error font-currency-cell text-currency-cell font-semibold">- Rs.</span>
                  <input
                    className="w-16 h-7 text-right px-1.5 rounded bg-surface-container-lowest text-error font-currency-cell text-currency-cell font-bold focus:outline-none"
                    type="number"
                    value={discount}
                    onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="flex justify-between items-center text-on-surface-variant font-body-sm text-body-sm">
                <span className="flex items-center gap-1">
                  Sales Tax / GST{' '}
                  <span className="text-secondary text-[11px] bg-secondary/15 px-1 rounded font-medium">
                    Govt Agri Exempt
                  </span>
                </span>
                <span className="font-currency-cell text-currency-cell text-outline">Rs. 0.00</span>
              </div>

              {/* Crisp Grand Net Total Highlight Strip */}
              <div className="mt-2 pt-2 bg-surface-container-lowest p-space-sm rounded-xl flex items-center justify-between shadow-sm">
                <div>
                  <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline block leading-none font-semibold">
                    Net Payable
                  </span>
                  <span className="font-label-sm text-label-sm text-secondary font-medium">Round-off applied</span>
                </div>
                <span
                  className={`font-display text-display text-primary font-bold tracking-tight inline-block ${
                    netPayableBump ? 'erp-animate-bump' : ''
                  }`}
                >
                  Rs. {netPayable.toLocaleString()}
                </span>
              </div>

              {/* Payment Methods Quick Switcher */}
              <div className="mt-2">
                <label className="font-label-sm text-label-sm uppercase tracking-wider text-outline font-semibold block mb-1.5">
                  Payment Method
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  <button
                    className={`pay-method-btn px-2 py-2 rounded-lg font-label-sm text-label-sm font-semibold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      paymentMethod === 'cash'
                        ? 'bg-primary text-on-primary shadow-sm'
                        : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'
                    }`}
                    onClick={() => setPaymentMethod('cash')}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">payments</span>
                    <span>Cash</span>
                  </button>

                  <button
                    className={`pay-method-btn px-2 py-2 rounded-lg font-label-sm text-label-sm font-semibold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      paymentMethod === 'bank'
                        ? 'bg-primary text-on-primary shadow-sm'
                        : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'
                    }`}
                    onClick={() => setPaymentMethod('bank')}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">account_balance</span>
                    <span>Bank Trf</span>
                  </button>

                  <button
                    className={`pay-method-btn px-2 py-2 rounded-lg font-label-sm text-label-sm font-semibold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      paymentMethod === 'easypaisa'
                        ? 'bg-primary text-on-primary shadow-sm'
                        : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'
                    }`}
                    onClick={() => setPaymentMethod('easypaisa')}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">phone_android</span>
                    <span>Easypaisa</span>
                  </button>

                  <button
                    className={`pay-method-btn px-2 py-2 rounded-lg font-label-sm text-label-sm font-semibold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      paymentMethod === 'jazzcash'
                        ? 'bg-primary text-on-primary shadow-xs'
                        : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'
                    } erp-btn-press active:scale-95`}
                    onClick={() => setPaymentMethod('jazzcash')}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">contactless</span>
                    <span>JazzCash</span>
                  </button>

                  <button
                    className={`pay-method-btn px-2 py-2 rounded-lg font-label-sm text-label-sm font-semibold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      paymentMethod === 'khata'
                        ? 'bg-primary text-on-primary shadow-xs'
                        : 'bg-surface-container-lowest text-error hover:bg-surface-container'
                    } erp-btn-press active:scale-95`}
                    onClick={() => setPaymentMethod('khata')}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">menu_book</span>
                    <span>On Khata</span>
                  </button>
                </div>
              </div>

              {/* Cash Received & Change Due Calculation */}
              <div
                className={`grid grid-cols-2 gap-space-sm mt-1 transition-opacity ${
                  paymentMethod === 'khata' ? 'opacity-40 pointer-events-none' : ''
                }`}
              >
                <div className="bg-surface-container-lowest p-2 rounded-lg">
                  <label className="font-label-sm text-label-sm text-outline block leading-tight">Cash Received</label>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="font-label-md text-label-md text-outline font-semibold">Rs.</span>
                    <input
                      className="w-full font-currency-cell text-currency-cell text-on-surface font-bold bg-transparent focus:outline-none"
                      type="number"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div className="bg-surface-container-lowest p-2 rounded-lg">
                  <label className="font-label-sm text-label-sm text-outline block leading-tight">Change Due (Wapsi)</label>
                  <span
                    className={`font-currency-cell text-currency-cell font-bold block mt-1 ${
                      changeDue >= 0 ? 'text-secondary' : 'text-error'
                    }`}
                  >
                    {changeDue >= 0 ? `Rs. ${changeDue.toLocaleString()}` : `Short: Rs. ${Math.abs(changeDue).toLocaleString()}`}
                  </span>
                </div>
              </div>

              {/* Bottom Action Execution Buttons */}
              <div className="flex flex-col gap-2 mt-2">
                <button
                  className="w-full h-12 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-headline-sm text-headline-sm font-bold flex items-center justify-center gap-2 shadow-md erp-btn-press active:scale-[0.98] transition-all cursor-pointer"
                  onClick={handleCompleteSale}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[22px]">print</span>
                  <span>Complete Sale &amp; Print Bill</span>
                  <span className="ml-1 px-2 py-0.5 rounded bg-surface-container-lowest/20 text-[11px] font-normal tracking-wide">
                    Enter / F8
                  </span>
                </button>

                <div className="grid grid-cols-2 gap-space-sm">
                  <button
                    className="h-9 px-space-sm rounded-lg bg-surface-container-lowest hover:bg-surface-container text-on-surface font-label-md text-label-md flex items-center justify-center gap-1.5 shadow-sm erp-btn-press transition-colors cursor-pointer"
                    onClick={() => alert('Sale bill placed on Hold #HLD-401')}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">pause</span>
                    <span>Hold Bill [F4]</span>
                  </button>
                  <button
                    className="h-9 px-space-sm rounded-lg bg-surface-container-lowest hover:bg-surface-container text-on-surface font-label-md text-label-md flex items-center justify-center gap-1.5 shadow-sm erp-btn-press transition-colors cursor-pointer"
                    onClick={() => alert('Quotation generated without stock deduction')}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">request_quote</span>
                    <span>Print Quotation</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default POSPage;
