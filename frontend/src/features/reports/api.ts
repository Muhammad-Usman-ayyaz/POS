import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import type { CategoryTotal, DashboardSummary, ProfitAnalysis, SupplierTotal, TopProduct, TrendPoint } from './types';

export const useDashboardSummary = () =>
  useQuery({
    queryKey: ['reports/dashboard-summary'],
    queryFn: async () => (await apiClient.get<DashboardSummary>('/reports/dashboard-summary/')).data,
    refetchInterval: 60_000,
  });

export const useSalesTrend = (days: number) =>
  useQuery({
    queryKey: ['reports/sales-trend', days],
    queryFn: async () => (await apiClient.get<TrendPoint[]>('/reports/sales-trend/', { params: { days } })).data,
  });

export const useSalesByCategory = (days: number) =>
  useQuery({
    queryKey: ['reports/sales-by-category', days],
    queryFn: async () => (await apiClient.get<CategoryTotal[]>('/reports/sales-by-category/', { params: { days } })).data,
  });

export const useTopProducts = (days: number, limit = 10) =>
  useQuery({
    queryKey: ['reports/top-products', days, limit],
    queryFn: async () => (await apiClient.get<TopProduct[]>('/reports/top-products/', { params: { days, limit } })).data,
  });

export const useProfitAnalysis = (days: number) =>
  useQuery({
    queryKey: ['reports/profit-analysis', days],
    queryFn: async () => (await apiClient.get<ProfitAnalysis>('/reports/profit-analysis/', { params: { days } })).data,
  });

export const usePurchaseTrend = (days: number) =>
  useQuery({
    queryKey: ['reports/purchase-trend', days],
    queryFn: async () => (await apiClient.get<TrendPoint[]>('/reports/purchase-trend/', { params: { days } })).data,
  });

export const usePurchasesBySupplier = (days: number, limit = 10) =>
  useQuery({
    queryKey: ['reports/purchases-by-supplier', days, limit],
    queryFn: async () => (await apiClient.get<SupplierTotal[]>('/reports/purchases-by-supplier/', { params: { days, limit } })).data,
  });
