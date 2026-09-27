import React from 'react';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  pageSizes?: number[];
  noun?: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

/** Numbered page window: 1 … 4 5 [6] 7 8 … 20 */
const pageWindow = (page: number, pages: number): (number | 'gap')[] => {
  const wanted = new Set([1, pages, page - 1, page, page + 1]);
  const list = [...wanted].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  list.forEach((n, i) => {
    if (i > 0 && n - list[i - 1] > 1) out.push('gap');
    out.push(n);
  });
  return out;
};

export const Pagination: React.FC<PaginationProps> = ({
  page,
  pageSize,
  total,
  pageSizes = [10, 25, 50, 100],
  noun = 'items',
  onPageChange,
  onPageSizeChange,
}) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const numberBtn = 'h-8 w-8 rounded-lg font-label-md text-label-md flex items-center justify-center transition-colors cursor-pointer';

  return (
    <div className="p-space-md bg-surface-container-lowest flex flex-col md:flex-row items-center justify-between gap-space-md">
      <div className="flex items-center gap-space-md text-outline font-body-sm text-body-sm">
        <span>
          Showing <strong className="text-on-surface font-semibold">{from} to {to}</strong> of{' '}
          <strong className="text-on-surface font-semibold">{total}</strong> {noun}
        </span>
        <div className="hidden sm:flex items-center gap-1.5">
          <span>Rows per page:</span>
          <select
            aria-label="Rows per page"
            className="h-8 pl-2 pr-6 rounded bg-surface-container-low text-on-surface font-label-sm text-label-sm focus:outline-none"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {pageSizes.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          className="h-8 px-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container-high text-on-surface flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:text-outline"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          <span className="hidden sm:inline font-label-md text-label-md pr-1">Prev</span>
        </button>
        {pageWindow(page, pages).map((n, i) =>
          n === 'gap' ? (
            <span key={`gap-${i}`} className="px-1 text-outline">...</span>
          ) : (
            <button
              key={n}
              aria-current={n === page ? 'page' : undefined}
              className={`${numberBtn} ${n === page ? 'bg-primary-container text-on-primary shadow-sm' : 'hover:bg-surface-container-high text-on-surface'}`}
              onClick={() => onPageChange(n)}
              type="button"
            >
              {n}
            </button>
          )
        )}
        <button
          className="h-8 px-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container-high text-on-surface flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:text-outline"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          type="button"
        >
          <span className="hidden sm:inline font-label-md text-label-md pl-1">Next</span>
          <span className="material-symbols-outlined text-[18px]">chevron_right</span>
        </button>
      </div>
    </div>
  );
};

export default Pagination;
