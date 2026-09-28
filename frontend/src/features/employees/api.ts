import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import { createResource } from '@/lib/resource';
import type { Employee, EmployeeInput } from './types';

export const employees = createResource<Employee, EmployeeInput>('employees');

export const useReactivateEmployee = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await apiClient.post<Employee>(`/employees/${id}/reactivate/`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: employees.key() }),
  });
};
