import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import { createResource } from '@/lib/resource';
import type { PaymentInput, Purchase, PurchaseInput } from './types';

export const purchases = createResource<Purchase, PurchaseInput>('purchases');

export const useCancelPurchase = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await apiClient.post<Purchase>(`/purchases/${id}/cancel/`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: purchases.key() }),
  });
};

export const useRecordSupplierPayment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: PaymentInput }) =>
      (await apiClient.post<Purchase>(`/purchases/${id}/pay/`, input)).data,
    meta: { silent: true },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: purchases.key() });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
};
