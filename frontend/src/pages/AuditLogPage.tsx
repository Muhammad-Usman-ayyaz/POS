import React, { useState } from 'react';
import { auditLogs } from '@/features/audit/api';
import { AUDIT_ACTION_LABELS, type AuditAction } from '@/features/audit/types';
import { Pagination } from '@/components/Pagination';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getErrorMessage } from '@/lib/apiError';

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

const ACTION_STYLES: Record<AuditAction, string> = {
  SALE_CREATED: 'bg-success-soft text-success',
  SALE_CANCELLED: 'bg-danger-soft text-danger',
  PURCHASE_RECEIVED: 'bg-success-soft text-success',
  PURCHASE_CANCELLED: 'bg-danger-soft text-danger',
  SUPPLIER_PAYMENT_RECORDED: 'bg-info-soft text-info',
  KHATA_CHARGE_RECORDED: 'bg-warning-soft text-warning',
  KHATA_PAYMENT_RECORDED: 'bg-info-soft text-info',
  STOCK_ADJUSTED: 'bg-warning-soft text-warning',
  EMPLOYEE_CREATED: 'bg-success-soft text-success',
  EMPLOYEE_UPDATED: 'bg-info-soft text-info',
  EMPLOYEE_DEACTIVATED: 'bg-danger-soft text-danger',
  EMPLOYEE_REACTIVATED: 'bg-success-soft text-success',
  LOGIN_SUCCESS: 'bg-success-soft text-success',
  LOGIN_FAILED: 'bg-danger-soft text-danger',
};

export const AuditLogPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery);
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const list = auditLogs.useList({ search: debouncedSearch || undefined, action: actionFilter || undefined, page, page_size: pageSize });
  const rows = list.data?.results ?? [];
  const total = list.data?.count ?? 0;

  return (
    <div className="flex flex-col w-full gap-y-space-md erp-animate-page">
      <div className="erp-stagger-item erp-stagger-1 glass-card flex flex-col lg:flex-row lg:items-center justify-between gap-space-md p-space-lg rounded-xl shadow-sm">
        <div className="flex items-center gap-space-sm">
          <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[24px]">shield_person</span>
          </div>
          <div>
            <div className="flex items-center gap-space-xs">
              <h1 className="font-headline-lg text-headline-lg text-on-surface">Audit Log</h1>
              <span className="px-space-xs py-0.5 rounded-full bg-surface-container text-primary font-label-sm text-label-sm">{total} Entries</span>
            </div>
            <p className="font-body-sm text-body-sm text-outline">Who did what — every sale, purchase, khata entry, stock adjustment, employee change, and login attempt.</p>
          </div>
        </div>
      </div>

      <div className="erp-stagger-item erp-stagger-2 glass-toolbar p-space-md rounded-xl shadow-sm flex flex-col md:flex-row gap-space-sm">
        <div className="flex-1 relative flex items-center">
          <span className="material-symbols-outlined absolute left-3 text-outline text-[20px]">search</span>
          <input
            className="w-full h-[40px] pl-10 pr-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-sm text-body-sm focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container"
            placeholder="Search by summary..."
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="h-[40px] px-3 rounded-lg bg-surface-container-low text-on-surface font-label-md text-label-md focus:outline-none focus:ring-2 focus:ring-primary-container"
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Activity</option>
          {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="erp-stagger-item erp-stagger-3 bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-outline font-label-sm text-label-sm uppercase tracking-wider">
                <th className="py-space-sm pl-space-md pr-space-sm min-w-[170px]">Date &amp; Time</th>
                <th className="py-space-sm px-space-sm min-w-[150px]">Action</th>
                <th className="py-space-sm px-space-sm min-w-[240px]">Details</th>
                <th className="py-space-sm pr-space-md pl-space-sm min-w-[130px]">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-low font-body-md text-body-md text-on-surface">
              {list.isPending && <tr><td className="py-space-xl text-center text-outline" colSpan={4}>Loading audit log...</td></tr>}
              {list.isError && (
                <tr>
                  <td className="py-space-xl text-center text-error" colSpan={4}>
                    {getErrorMessage(list.error, 'Could not load the audit log.')}{' '}
                    <button className="text-primary underline cursor-pointer" onClick={() => list.refetch()} type="button">Retry</button>
                  </td>
                </tr>
              )}
              {list.isSuccess && rows.length === 0 && (
                <tr><td className="py-space-xl text-center text-outline" colSpan={4}>No activity matches these filters.</td></tr>
              )}
              {rows.map((entry) => (
                <tr key={entry.id} className="hover:bg-surface-container-low/60 transition-colors">
                  <td className="py-3 pl-space-md pr-space-sm font-body-sm text-body-sm text-outline whitespace-nowrap">{formatDateTime(entry.created_at)}</td>
                  <td className="py-3 px-space-sm">
                    <span className={`px-2 py-0.5 rounded-full font-label-sm text-label-sm font-semibold inline-block ${ACTION_STYLES[entry.action]}`}>
                      {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                    </span>
                  </td>
                  <td className="py-3 px-space-sm font-body-sm text-body-sm text-on-surface-variant">{entry.summary}</td>
                  <td className="py-3 pr-space-md pl-space-sm font-label-md text-label-md text-on-surface">{entry.actor_name || 'System'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination noun="entries" onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} page={page} pageSize={pageSize} total={total} />
      </div>
    </div>
  );
};

export default AuditLogPage;
