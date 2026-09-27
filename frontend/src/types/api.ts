/** Shape of a DRF page (PageNumberPagination). */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** Query params accepted by list endpoints. */
export type ListParams = Record<string, string | number | boolean | undefined>;
