// What the held-bills channels return. Plain data only.
//
// RULE: no price, tax, total or cost in any of these types (a held bill is a draft of what the cashier chose; the prices come from a new
// quote on resume). `held_by_name` is read from the users table by the shell's own user id, never from the request.

export interface HeldBillCustomer {
  id: string;
  name_en: string | null;
  name_ur: string | null;
  village: string | null;
  default_price_type: 'retail' | 'wholesale';
}

/** A bill on hold, for the F6 list: who held it and when, not what it costs. */
export interface HeldBillSummary {
  id: string;
  held_by_name: string;
  /** ISO date-time (UTC). */
  held_at: string;
  customer: HeldBillCustomer | null;
  price_type: 'retail' | 'wholesale';
  line_count: number;
  note: string | null;
}

/** One line of a resumed bill: the choice, and the product's name (without the size) and the size's pack so the screen can show it (no price). */
export interface HeldBillLine {
  product_id: string;
  /** Base units. */
  qty: number;
  /** Paisa taken off the line, as entered. 0: none. */
  discount: number;
  batch_id: string | null;
  name_en: string | null;
  name_ur: string | null;
  pack_label: string;
  pack_size: number;
  allow_loose: boolean;
  base_unit: 'ml' | 'g' | 'piece';
}

export interface ResumedHeldBill extends HeldBillSummary {
  lines: HeldBillLine[];
}
