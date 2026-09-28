import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import { createResource } from '@/lib/resource';
import type { Sale, SaleInput } from './types';

export const sales = createResource<Sale, SaleInput>('sales');

export const useCancelSale = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await apiClient.post<Sale>(`/sales/${id}/cancel/`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sales.key() });
      qc.invalidateQueries({ queryKey: ['inventory/batches'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['khata'] });
    },
  });
};

/** Opens the authenticated PDF invoice in a new tab (a plain link/iframe would lack the JWT). */
export const openInvoicePdf = async (id: number) => {
  const response = await apiClient.get<Blob>(`/sales/${id}/invoice/`, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

export const downloadInvoicePdf = async (id: number, filename: string) => {
  const response = await apiClient.get<Blob>(`/sales/${id}/invoice/`, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
