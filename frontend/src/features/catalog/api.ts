import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import { createResource } from '@/lib/resource';
import type { ListParams } from '@/types/api';
import type { NamedRef, Product, ProductInput, ProductSummary } from './types';

export const products = createResource<Product, ProductInput>('catalog/products');

export const useCategories = () =>
  useQuery({
    queryKey: ['catalog/categories'],
    queryFn: async () => (await apiClient.get<NamedRef[]>('/catalog/categories/')).data,
    staleTime: 1000 * 60 * 30,
  });

export const useBrands = () =>
  useQuery({
    queryKey: ['catalog/brands'],
    queryFn: async () => (await apiClient.get<NamedRef[]>('/catalog/brands/')).data,
    staleTime: 1000 * 60 * 30,
  });

// Key lives under the products prefix so any product mutation refreshes the summary too.
export const useProductSummary = () =>
  useQuery({
    queryKey: [...products.key(), 'summary'],
    queryFn: async () => (await apiClient.get<ProductSummary>('/catalog/products/summary/')).data,
  });

/** Downloads the CSV for the given filters via the authenticated client (a plain link would lack the JWT). */
export const downloadProductsCsv = async (params: ListParams) => {
  const response = await apiClient.get<Blob>('/catalog/products/export/', { params, responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'products.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
