import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import type { Paginated } from '@/types/api';
import type { LedgerEntry } from './types';

interface LedgerParams {
  search?: string;
  type?: 'CHARGE' | 'PAYMENT';
  customer?: number;
  page?: number;
  page_size?: number;
}

export const useKhataLedger = (params?: LedgerParams) =>
  useQuery({
    queryKey: ['khata/ledger', params ?? {}],
    queryFn: async () => (await apiClient.get<Paginated<LedgerEntry>>('/khata/ledger/', { params })).data,
  });

export const useCustomerLedger = (customerId: number | undefined) =>
  useQuery({
    queryKey: ['khata/ledger', 'customer', customerId],
    queryFn: async () => (await apiClient.get<LedgerEntry[]>(`/customers/${customerId}/ledger/`)).data,
    enabled: customerId !== undefined,
  });
