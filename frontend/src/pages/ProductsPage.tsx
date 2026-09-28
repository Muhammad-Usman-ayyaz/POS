import React, { useState } from 'react';
import { useAuthStore } from '@/features/auth/store';
import {
  downloadProductsCsv,
  products as productsApi,
  useBrands,
  useCategories,
  useProductSummary,
} from '@/features/catalog/api';
import { ProductFormDrawer, type DrawerMode } from '@/features/catalog/components/ProductFormDrawer';
import type { Product, ProductInput } from '@/features/catalog/types';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Pagination } from '@/components/Pagination';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getErrorMessage } from '@/lib/apiError';
import { notify, notifyError } from '@/lib/notify';

const CATEGORY_ICONS: Record<string, string> = {
  insecticide: 'science',
  fungicide: 'spa',
  fertilizer: 'grain',
  herbicide: 'grass',
};
const iconFor = (categoryName: string) => CATEGORY_ICONS[categoryName.toLowerCase()] ?? 'science';

const rs = (value: string | number | null) => (value === null ? '—' : `Rs. ${Number(value).toLocaleString()}`);
const formatExpiry = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—';

type DrawerState = { mode: DrawerMode; product?: Product } | null;

export const ProductsPage: React.FC = () => {
  const role = useAuthStore((state) => state.role);
  const canEdit = role === 'OWNER' || role === 'MANAGER';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedStockStatus, setSelectedStockStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);

  const debouncedSearch = useDebouncedValue(searchQuery);

  // Any filter change goes back to page 1.
  const withPageReset = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };
  const changeSearch = withPageReset(setSearchQuery);
  const changeCategory = withPageReset(setSelectedCategory);
  const changeBrand = withPageReset(setSelectedBrand);
  const changeStockStatus = withPageReset(setSelectedStockStatus);
  const changePageSize = withPageReset(setPageSize);
  const filterParams = {
    search: debouncedSearch || undefined,
    category: selectedCategory || undefined,
    brand: selectedBrand || undefined,
    stock_status: selectedStockStatus || undefined,
  };

  const { data: categories = [] } = useCategories();
  const { data: brands = [] } = useBrands();
  const { data: summary } = useProductSummary();
  const list = productsApi.useList({ ...filterParams, page, page_size: pageSize });
  const products = list.data?.results ?? [];
  const total = list.data?.count ?? 0;

  const createProduct = productsApi.useCreate({ silent: true });
  const updateProduct = productsApi.useUpdate({ silent: true });
  const removeProduct = productsApi.useRemove();
  const saving = createProduct.isPending || updateProduct.isPending;

  const closeDrawer = () => {
    setDrawer(null);
    createProduct.reset();
    updateProduct.reset();
  };

  // Save errors show inside the drawer (silent:true keeps the global toast quiet).
  const handleSave = (input: ProductInput) => {
    if (drawer?.mode === 'edit' && drawer.product) {
      updateProduct.mutate(
        { id: drawer.product.id, input },
        { onSuccess: () => { notify(`${input.name} updated`); closeDrawer(); } }
      );
    } else {
      createProduct.mutate(input, {
        onSuccess: () => { notify(`${input.name} added to the catalog`); closeDrawer(); },
      });
    }
  };

  const handleDelete = () => {
    if (!pendingDelete) return;
    removeProduct.mutate(pendingDelete.id, {
      onSuccess: () => {
        notify(`${pendingDelete.name} deleted`);
        setSelectedRows((rows) => rows.filter((id) => id !== pendingDelete.id));
        setPendingDelete(null);
      },
    });
  };

  const handleExport = async () => {
    try {
      await downloadProductsCsv(filterParams);
    } catch (error) {
      notifyError(getErrorMessage(error, 'Could not export the catalog.'));
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedRows(e.target.checked ? products.map((p) => p.id) : []);
  };

  const handleSelectRow = (id: number) => {
    setSelectedRows((rows) => (rows.includes(id) ? rows.filter((rId) => rId !== id) : [...rows, id]));
  };

  const handleResetFilters = () => {
    changeSearch('');
    changeCategory('');
    changeBrand('');
    changeStockStatus('');
  };

  const selectedCategoryName = categories.find((c) => String(c.id) === selectedCategory)?.name;
  const allOnPageSelected = products.length > 0 && products.every((p) => selectedRows.includes(p.id));

  return (
    <div className="flex flex-col w-full gap-y-space-md">
      {/* Top Headline / Metrics & Action Summary Bar */}
      <div className="erp-stagger-item erp-stagger-1 glass-card flex flex-col lg:flex-row lg:items-center justify-between gap-space-md p-space-lg rounded-xl shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-space-md">
          <div className="flex items-center gap-space-sm">
            <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[24px]">pest_control</span>
            </div>
            <div>
              <div className="flex items-center gap-space-xs">
                <h1 className="font-headline-lg text-headline-lg text-on-surface">Products Catalog</h1>
                <span className="px-space-xs py-0.5 rounded-full bg-surface-container text-primary font-label-sm text-label-sm">
                  {summary?.total_products ?? total} Registered
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
              <span className="font-currency-cell text-currency-cell text-on-surface whitespace-nowrap">{summary ? rs(summary.stock_value) : '—'}</span>
            </div>
            <div className="h-6 w-px bg-outline-variant/40 mx-space-xs"></div>
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Critical Alerts</span>
              <span className="font-currency-cell text-currency-cell text-error flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></span> {summary?.low_stock_count ?? 0} Low Stock
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-space-xs">
          <button
            className="h-[38px] px-space-md rounded-lg bg-surface-container-low text-on-surface hover:bg-surface-container-high transition-colors font-label-md text-label-md flex items-center gap-1.5 shadow-sm cursor-pointer"
            type="button"
            onClick={handleExport}
          >
            <span className="material-symbols-outlined text-[18px] text-outline">file_download</span>
            <span>Export CSV</span>
          </button>
          <button
            className="h-[38px] px-space-md rounded-lg bg-surface-container-low text-on-surface hover:bg-surface-container-high transition-colors font-label-md text-label-md flex items-center gap-1.5 shadow-sm cursor-pointer"
            type="button"
            onClick={() => notify('Barcode printing arrives with barcode scanner support.')}
          >
            <span className="material-symbols-outlined text-[18px] text-outline">barcode_scanner</span>
            <span>Print Barcodes</span>
          </button>
          {canEdit && (
            <button
              className="h-[38px] px-space-md rounded-lg bg-primary-container text-on-primary hover:bg-primary transition-colors font-label-md text-label-md flex items-center gap-1.5 shadow-sm cursor-pointer"
              id="openNewProductBtn"
              type="button"
              onClick={() => setDrawer({ mode: 'create' })}
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              <span>+ Add New Product</span>
            </button>
          )}
        </div>
      </div>

      {/* Filtration & Global Discovery Toolbar */}
      <div className="erp-stagger-item erp-stagger-2 glass-toolbar p-space-md rounded-xl shadow-sm flex flex-col gap-space-sm">
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
              onChange={(e) => changeSearch(e.target.value)}
            />
            {searchQuery && (
              <button
                className="absolute right-2.5 text-outline hover:text-on-surface p-1 cursor-pointer"
                title="Clear search"
                type="button"
                onClick={() => changeSearch('')}
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
                onChange={(e) => changeCategory(e.target.value)}
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
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
                onChange={(e) => changeBrand(e.target.value)}
              >
                <option value="">All Brands</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
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
                onChange={(e) => changeStockStatus(e.target.value)}
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
            Category: {selectedCategoryName || 'All'}
            {selectedCategory && (
              <button className="hover:text-error flex items-center cursor-pointer" onClick={() => changeCategory('')}>
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
      <div className="erp-stagger-item erp-stagger-3 bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-outline font-label-sm text-label-sm uppercase tracking-wider select-none">
                <th className="py-space-sm pl-space-md pr-space-xs w-10 text-center">
                  <input
                    className="rounded bg-surface-container-highest text-primary focus:ring-0 cursor-pointer"
                    type="checkbox"
                    checked={allOnPageSelected}
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
              key={`${debouncedSearch}-${selectedCategory}-${selectedBrand}-${selectedStockStatus}-${page}-${pageSize}`}
              className="divide-y divide-surface-container-low font-body-md text-body-md text-on-surface"
            >
              {list.isPending && (
                <tr>
                  <td className="py-space-xl text-center text-outline font-body-md" colSpan={12}>Loading products...</td>
                </tr>
              )}
              {list.isError && (
                <tr>
                  <td className="py-space-xl text-center text-error font-body-md" colSpan={12}>
                    {getErrorMessage(list.error, 'Could not load products.')}{' '}
                    <button className="text-primary underline cursor-pointer" onClick={() => list.refetch()} type="button">Retry</button>
                  </td>
                </tr>
              )}
              {list.isSuccess && products.length === 0 && (
                <tr>
                  <td className="py-space-xl text-center text-outline font-body-md" colSpan={12}>No products match these filters.</td>
                </tr>
              )}
              {products.map((p, idx) => {
                const isSelected = selectedRows.includes(p.id);
                const isOutOfStock = p.stock_status === 'Out of Stock';

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
                          <span className="material-symbols-outlined text-[20px]">{iconFor(p.category_name)}</span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-headline-sm text-headline-sm text-on-surface font-semibold truncate group-hover:text-primary transition-colors">
                            {p.name}
                          </span>
                          <span className="font-body-sm text-body-sm text-outline truncate">{p.chemical}</span>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="px-1.5 py-0.2 rounded bg-surface-container-high font-label-sm text-label-sm text-on-surface-variant">
                              {p.packaging || '—'}
                            </span>
                            <span className="font-label-sm text-label-sm text-outline">{p.formulation_type}</span>
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
                          p.category_name === 'Insecticide'
                            ? 'bg-primary-fixed text-on-primary-fixed-variant'
                            : p.category_name === 'Fertilizer'
                            ? 'bg-secondary-fixed text-on-secondary-fixed-variant font-semibold'
                            : p.category_name === 'Fungicide'
                            ? 'bg-tertiary-fixed text-on-tertiary-fixed font-semibold'
                            : 'bg-surface-container-highest text-primary font-semibold'
                        }`}
                      >
                        {p.category_name}
                      </span>
                    </td>
                    <td className="py-3 px-space-sm">
                      <span className="font-label-md text-label-md text-on-surface">{p.brand_name}</span>
                      <span className="block font-body-sm text-body-sm text-outline">{p.distributor}</span>
                    </td>
                    <td className="py-3 px-space-sm text-right">
                      <span className="font-currency-cell text-currency-cell text-outline">
                        {rs(p.purchase_price)}
                      </span>
                    </td>
                    <td className="py-3 px-space-sm text-right">
                      <span className="font-currency-cell text-currency-cell text-on-surface font-bold">
                        {rs(p.selling_price)}
                      </span>
                    </td>
                    <td className="py-3 px-space-sm text-right">
                      <span className="font-label-md text-label-md text-secondary font-semibold">{p.margin_pct === null ? '—' : `${p.margin_pct > 0 ? '+' : ''}${p.margin_pct}%`}</span>
                    </td>
                    <td className="py-3 px-space-sm text-right">
                      <div className="flex flex-col items-end">
                        <span
                          className={`font-currency-cell text-currency-cell ${
                            p.stock_status === 'Low Stock'
                              ? 'text-error font-bold'
                              : p.stock_status === 'Out of Stock'
                              ? 'text-error font-bold'
                              : 'text-on-surface'
                          }`}
                        >
                          {Number(p.current_stock).toLocaleString()} {p.stock_unit}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-label-sm text-label-sm mt-0.5 ${
                            p.stock_status === 'Healthy'
                              ? 'bg-secondary-fixed text-on-secondary-fixed'
                              : p.stock_status === 'Low Stock'
                              ? 'bg-error-container text-on-error-container'
                              : 'bg-danger-soft text-danger'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              p.stock_status === 'Healthy' ? 'bg-secondary' : 'bg-error'
                            }`}
                          ></span>{' '}
                          {p.stock_status}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-space-sm">
                      <span className="font-label-md text-label-md text-on-surface">{formatExpiry(p.expiry_date)}</span>
                      <span className="block font-label-sm text-label-sm text-outline">{p.batch_no ? `Batch #${p.batch_no}` : '—'}</span>
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
                          onClick={() => setDrawer({ mode: 'view', product: p })}
                        >
                          <span className="material-symbols-outlined text-[18px]">visibility</span>
                        </button>
                        {canEdit && (
                          <button
                            className="w-8 h-8 rounded-lg hover:bg-surface-container-high text-outline hover:text-primary flex items-center justify-center transition-colors cursor-pointer"
                            title="Edit Formulation"
                            type="button"
                            onClick={() => setDrawer({ mode: 'edit', product: p })}
                          >
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </button>
                        )}
                        {canEdit && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="w-8 h-8 rounded-lg hover:bg-surface-container-high text-outline hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer"
                                title="More Options"
                                type="button"
                              >
                                <span className="material-symbols-outlined text-[18px]">more_vert</span>
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setPendingDelete(p)} variant="destructive">
                                Delete product
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Pagination
          noun="products"
          onPageChange={setPage}
          onPageSizeChange={changePageSize}
          page={page}
          pageSize={pageSize}
          total={total}
        />
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
            <span className="font-headline-sm text-headline-sm text-on-surface mt-0.5">Available once sales are recorded</span>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Fastest-moving products appear here after the first POS sales.
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
              <span className="font-currency-stat text-currency-stat text-primary">{summary?.weighted_margin_pct != null ? `${summary.weighted_margin_pct}%` : '—'}</span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Weighted by current stock value at cost.
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
              <span className="font-headline-sm text-headline-sm text-tertiary">{summary?.expiring_soon_count ?? 0} Formulations</span>
              <span className="font-label-sm text-label-sm text-outline">Expiring &lt; {summary?.expiry_warning_days ?? 180} days</span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              {summary?.expired_count ? `${summary.expired_count} already expired — remove from shelves.` : 'Consider a promotional discount or a vendor replacement request.'}
            </p>
          </div>
        </div>
      </div>

      {drawer && (
        <ProductFormDrawer
          brands={brands}
          categories={categories}
          error={drawer.mode === 'edit' ? updateProduct.error : createProduct.error}
          mode={drawer.mode}
          onClose={closeDrawer}
          onSubmit={handleSave}
          product={drawer.product}
          saving={saving}
        />
      )}

      <ConfirmDialog
        confirmLabel="Delete product"
        description={`"${pendingDelete?.name ?? ''}" will be hidden from the catalog. Its sales and stock history are kept.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDelete}
        open={pendingDelete !== null}
        pending={removeProduct.isPending}
        title="Delete this product?"
      />
    </div>
  );
};

export default ProductsPage;
