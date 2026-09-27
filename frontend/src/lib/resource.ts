import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import type { ListParams, Paginated } from '@/types/api';

/**
 * Typed React Query hooks for a standard DRF REST resource, e.g.
 *   export const products = createResource<Product, ProductInput>('products');
 *   const { data } = products.useList({ search });
 * Each module (products, suppliers, ...) gets its hooks from one line.
 */
export function createResource<T extends { id: number | string }, TInput = Partial<T>>(path: string) {
  const key = (...parts: unknown[]) => [path, ...parts] as const;
  const base = `/${path}/`;

  const api = {
    list: async (params?: ListParams) => (await apiClient.get<Paginated<T>>(base, { params })).data,
    get: async (id: T['id']) => (await apiClient.get<T>(`${base}${id}/`)).data,
    create: async (input: TInput) => (await apiClient.post<T>(base, input)).data,
    update: async (id: T['id'], input: Partial<TInput>) => (await apiClient.patch<T>(`${base}${id}/`, input)).data,
    remove: async (id: T['id']) => {
      await apiClient.delete(`${base}${id}/`);
    },
  };

  const useList = (params?: ListParams) =>
    useQuery({ queryKey: key('list', params ?? {}), queryFn: () => api.list(params) });

  const useDetail = (id: T['id'] | undefined) =>
    useQuery({ queryKey: key('detail', id), queryFn: () => api.get(id as T['id']), enabled: id !== undefined });

  const useCreate = () => {
    const qc = useQueryClient();
    return useMutation({ mutationFn: api.create, onSuccess: () => qc.invalidateQueries({ queryKey: key() }) });
  };

  const useUpdate = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: ({ id, input }: { id: T['id']; input: Partial<TInput> }) => api.update(id, input),
      onSuccess: () => qc.invalidateQueries({ queryKey: key() }),
    });
  };

  const useRemove = () => {
    const qc = useQueryClient();
    return useMutation({ mutationFn: api.remove, onSuccess: () => qc.invalidateQueries({ queryKey: key() }) });
  };

  return { api, key, useList, useDetail, useCreate, useUpdate, useRemove };
}
