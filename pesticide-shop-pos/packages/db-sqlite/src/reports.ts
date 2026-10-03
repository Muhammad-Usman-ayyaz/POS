import type { Db } from './connection.js';

export interface ProfitDay {
  /** `YYYY-MM-DD` */
  day: string;
  /** Paisa. Net sales without tax, after returns. */
  revenue: number;
  /** Paisa. Cost copied onto each invoice line at sale time. */
  cost: number;
  profit: number;
}

/** Daily profit from the v_profit_by_day view, oldest day first. Owner-only data: the caller checks the role. */
export function profitByDay(db: Db, from: string, to: string): ProfitDay[] {
  return db
    .prepare('SELECT day, revenue, cost, profit FROM v_profit_by_day WHERE day >= ? AND day <= ? ORDER BY day')
    .all(from, to) as ProfitDay[];
}
