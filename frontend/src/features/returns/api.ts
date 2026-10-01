import { useQueryClient } from '@tanstack/react-query';
import { createResource } from '@/lib/resource';
import type { SalesReturn, SalesReturnInput } from './types';

export const salesReturns = createResource<SalesReturn, SalesReturnInput>('returns');

/** Create-a-return invalidates inventory (restocked) and khata (if settled as a credit) too. */
export const useCreateReturn = () => {
  const qc = useQueryClient();
  const create = salesReturns.useCreate();
  return {
    ...create,
    mutateAsync: async (input: SalesReturnInput) => {
      const result = await create.mutateAsync(input);
      qc.invalidateQueries({ queryKey: ['inventory/batches'] });
      qc.invalidateQueries({ queryKey: ['khata'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      return result;
    },
  };
};
