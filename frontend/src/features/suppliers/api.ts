import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import type { Supplier, SupplierInput } from './types';

// Suppliers are a bounded reference list, so the API returns a plain array (no pagination),
// unlike the products resource — createResource()'s Paginated<T> assumption doesn't fit here.
const BASE = '/suppliers/';
const key = (...parts: unknown[]) => ['suppliers', ...parts] as const;

export const suppliers = {
  useList: (params?: { search?: string }) =>
    useQuery({
      queryKey: key('list', params ?? {}),
      queryFn: async () => (await apiClient.get<Supplier[]>(BASE, { params })).data,
    }),

  useCreate: () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (input: SupplierInput) => (await apiClient.post<Supplier>(BASE, input)).data,
      meta: { silent: true },
      onSuccess: () => qc.invalidateQueries({ queryKey: key() }),
    });
  },

  useUpdate: () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async ({ id, input }: { id: number; input: Partial<SupplierInput> }) =>
        (await apiClient.patch<Supplier>(`${BASE}${id}/`, input)).data,
      meta: { silent: true },
      onSuccess: () => qc.invalidateQueries({ queryKey: key() }),
    });
  },

  useRemove: () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (id: number) => {
        await apiClient.delete(`${BASE}${id}/`);
      },
      onSuccess: () => qc.invalidateQueries({ queryKey: key() }),
    });
  },
};
