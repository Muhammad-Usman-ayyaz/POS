import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import { createResource } from '@/lib/resource';
import type { Customer, CustomerInput } from './types';
import type { ChargeInput, PaymentInput } from '@/features/khata/types';

export const customers = createResource<Customer, CustomerInput>('customers');

export const useRecordCharge = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: ChargeInput }) =>
      (await apiClient.post<Customer>(`/customers/${id}/charge/`, input)).data,
    meta: { silent: true },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: customers.key() });
      qc.invalidateQueries({ queryKey: ['khata/ledger'] });
    },
  });
};

export const useRecordCustomerPayment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: PaymentInput }) =>
      (await apiClient.post<Customer>(`/customers/${id}/pay/`, input)).data,
    meta: { silent: true },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: customers.key() });
      qc.invalidateQueries({ queryKey: ['khata/ledger'] });
    },
  });
};
