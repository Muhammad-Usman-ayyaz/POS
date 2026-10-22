import { z } from 'zod';
import type { Repositories } from '../ports/index.js';
import { Id, NonNegPaisa } from '../schemas/common.js';
import { ownerUser, parseInput, rowFactory, type ServiceDeps } from './support.js';

/** Credit limit given to every new customer, in paisa. 0 (the default) means no limit, as everywhere. */
export const DEFAULT_CREDIT_LIMIT_KEY = 'default_credit_limit';
/** 1 shows the farmer fields (father's name, CNIC, second phone, guarantor) on the customer screens. Off by default. The data stays when it is turned off. */
export const SHOW_FARMER_FIELDS_KEY = 'customers.show_farmer_fields';

/**
 * 1 gives a returning customer Khata credit even for the part they PAID in cash (Q8 setting, default 0 = cash back for what was paid, Khata
 * credit only for what is still owed). Owner only, like the other shop-level customer settings.
 */
export const REFUND_PAID_TO_KHATA_KEY = 'returns.refund_paid_part_to_khata';

export interface CustomerSettings {
  /** Paisa, never negative. */
  default_credit_limit: number;
  show_farmer_fields: boolean;
  /** Q8: refund what the customer paid to their Khata instead of cash. Off by default. */
  refund_paid_part_to_khata: boolean;
}

/** Reads inside a unit of work the caller already has. A missing, broken or negative value gives the code default (0 and off). */
export function readCustomerSettings(tx: Repositories): CustomerSettings {
  return {
    default_credit_limit: Math.max(0, tx.settings.getInt(DEFAULT_CREDIT_LIMIT_KEY, 0)),
    show_farmer_fields: tx.settings.getInt(SHOW_FARMER_FIELDS_KEY, 0) === 1,
    refund_paid_part_to_khata: tx.settings.getInt(REFUND_PAID_TO_KHATA_KEY, 0) === 1,
  };
}

const SetInput = z.strictObject({
  /** Paisa, a whole number, not negative. */
  default_credit_limit: NonNegPaisa.safe().optional(),
  show_farmer_fields: z.boolean().optional(),
  refund_paid_part_to_khata: z.boolean().optional(),
  /** The signed-in owner, set by the shell. */
  actor_id: Id,
});
export type CustomerSettingsInput = z.input<typeof SetInput>;

/** The shop-level customer settings. Reading is open to any signed-in user; changing is the owner's (the service checks, the shell checks too). */
export function createCustomerSettingsService(deps: ServiceDeps) {
  const rows = rowFactory(deps);
  return {
    get(): CustomerSettings {
      return deps.uow.run((tx) => readCustomerSettings(tx));
    },

    /**
     * Owner only. Writes the settings given, and ONE `customer_setting_changed` audit row per setting whose value really changed
     * (`details`: `field`, `from`, `to`), in the same transaction. A value sent unchanged writes nothing.
     */
    set(rawInput: CustomerSettingsInput): CustomerSettings {
      const input = parseInput(SetInput, rawInput);
      return deps.uow.run((tx) => {
        ownerUser(tx, input.actor_id);
        const before = readCustomerSettings(tx);
        const change = (field: string, key: string, from: number, to: number): void => {
          if (from === to) return;
          tx.settings.setInt(key, to);
          tx.audit.insert(rows.audit({ user_id: input.actor_id, action: 'customer_setting_changed', table_name: 'settings', row_id: key, details: { field, from, to } }));
        };
        if (input.default_credit_limit !== undefined) change('default_credit_limit', DEFAULT_CREDIT_LIMIT_KEY, before.default_credit_limit, input.default_credit_limit);
        if (input.show_farmer_fields !== undefined) change('show_farmer_fields', SHOW_FARMER_FIELDS_KEY, before.show_farmer_fields ? 1 : 0, input.show_farmer_fields ? 1 : 0);
        if (input.refund_paid_part_to_khata !== undefined) change('refund_paid_part_to_khata', REFUND_PAID_TO_KHATA_KEY, before.refund_paid_part_to_khata ? 1 : 0, input.refund_paid_part_to_khata ? 1 : 0);
        return readCustomerSettings(tx);
      });
    },
  };
}
export type CustomerSettingsService = ReturnType<typeof createCustomerSettingsService>;
