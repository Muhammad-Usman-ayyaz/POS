import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import { createResource } from '@/lib/resource';
import type { ListParams } from '@/types/api';
import type { AdjustmentInput, BatchStock, StockMovement } from './types';

export const batches = createResource<BatchStock>('inventory/batches');

export const useStockMovements = (params?: ListParams) =>
  useQuery({
    queryKey: ['inventory/movements', params ?? {}],
    queryFn: async () => (await apiClient.get<import('@/types/api').Paginated<StockMovement>>('/inventory/movements/', { params })).data,
  });

export const useCreateAdjustment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AdjustmentInput) => (await apiClient.post<StockMovement>('/inventory/adjustments/', input)).data,
    meta: { silent: true },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: batches.key() });
      qc.invalidateQueries({ queryKey: ['inventory/movements'] });
      qc.invalidateQueries({ queryKey: ['catalog/products'] });
    },
  });
};
