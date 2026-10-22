-- =====================================================================
-- 009: returns and voids (Phase 7). Additive only: nothing is dropped, no existing row loses data.
--
--  1. sales_returns.cash_amount, khata_amount
--       How the refund was paid: cash handed back and Khata credit. They add up to `total` (trigger below). `refund_method` stays as it
--       was ('khata_credit' when any of it went to Khata, else 'cash'). Existing rows are backfilled from refund_method: a 'khata_credit'
--       return put all its total on Khata, a 'cash' return paid all of it in cash.
--  2. sales_returns.requested_by
--       The user who started the return at the counter (staff may start one, the owner approves it: approved_by). NULL on old rows.
--  3. sales_return_items.reason
--       Why this line came back (a short code from the screen's list). Required by trigger when the goods are NOT resellable (a write-off
--       needs a reason). Old rows have none.
--  4. invoices: a voided invoice stays voided and keeps its void reason and person; it cannot be voided when it already has returns.
--  5. v_profit_by_day: a return takes off exactly what it refunded without tax (refund_amount - tax_refund), and the cost of the goods that
--       went back to stock by the same running difference the tax uses, so several partial returns add up to exactly the sale.
-- =====================================================================

ALTER TABLE sales_returns ADD COLUMN cash_amount INTEGER NOT NULL DEFAULT 0 CHECK (cash_amount >= 0);
ALTER TABLE sales_returns ADD COLUMN khata_amount INTEGER NOT NULL DEFAULT 0 CHECK (khata_amount >= 0);
ALTER TABLE sales_returns ADD COLUMN requested_by TEXT REFERENCES users(id);

UPDATE sales_returns SET khata_amount = total WHERE refund_method = 'khata_credit';
UPDATE sales_returns SET cash_amount = total WHERE refund_method = 'cash';

CREATE TRIGGER trg_sr_split_adds_up BEFORE INSERT ON sales_returns
WHEN NEW.cash_amount + NEW.khata_amount <> NEW.total
BEGIN SELECT RAISE(ABORT, 'sales_returns: cash_amount + khata_amount must equal total'); END;

CREATE TRIGGER trg_sr_split_adds_up_update BEFORE UPDATE OF total, cash_amount, khata_amount ON sales_returns
WHEN NEW.cash_amount + NEW.khata_amount <> NEW.total
BEGIN SELECT RAISE(ABORT, 'sales_returns: cash_amount + khata_amount must equal total'); END;

ALTER TABLE sales_return_items ADD COLUMN reason TEXT;

CREATE TRIGGER trg_sri_writeoff_needs_reason BEFORE INSERT ON sales_return_items
WHEN NEW.condition <> 'resellable' AND COALESCE(TRIM(NEW.reason), '') = ''
BEGIN SELECT RAISE(ABORT, 'sales_return_items: goods that are not resellable are written off and need a reason'); END;

-- A voided invoice stays voided: it cannot become active again, and its void reason, person and money cannot change.
CREATE TRIGGER trg_invoices_void_final BEFORE UPDATE OF status ON invoices
WHEN OLD.status = 'voided' AND NEW.status <> 'voided'
BEGIN SELECT RAISE(ABORT, 'invoices: a voided invoice cannot be made active again'); END;

CREATE TRIGGER trg_invoices_voided_frozen BEFORE UPDATE ON invoices
WHEN OLD.status = 'voided'
 AND (NEW.void_reason IS NOT OLD.void_reason OR NEW.voided_by IS NOT OLD.voided_by OR NEW.total IS NOT OLD.total
      OR NEW.paid_amount IS NOT OLD.paid_amount OR NEW.customer_id IS NOT OLD.customer_id)
BEGIN SELECT RAISE(ABORT, 'invoices: a voided invoice cannot be changed'); END;

-- Void is for a sale nobody has returned anything from. (With returns, the owner returns the rest instead.)
CREATE TRIGGER trg_invoices_void_no_returns BEFORE UPDATE OF status ON invoices
WHEN OLD.status = 'active' AND NEW.status = 'voided'
 AND EXISTS (SELECT 1 FROM sales_returns WHERE invoice_id = NEW.id AND deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'invoices: an invoice that has returns cannot be voided'); END;

-- Profit by day. Sales: unchanged. Returns: revenue taken off is refund_amount - tax_refund (exactly the sale's share without tax), cost put
-- back only for resellable goods, by the running difference of the line's cost over the cumulative returned quantity (rounded once per step).
DROP VIEW v_profit_by_day;
CREATE VIEW v_profit_by_day AS
SELECT day,
       CAST(SUM(revenue) AS INTEGER) AS revenue,
       CAST(SUM(cost) AS INTEGER) AS cost,
       CAST(SUM(revenue) - SUM(cost) AS INTEGER) AS profit
FROM (
    SELECT date(i.invoice_date) AS day,
           ii.line_total - ii.tax_amount AS revenue,
           CAST(ROUND(ii.cost_price * ii.qty * 1.0 / p.pack_size) AS INTEGER) AS cost
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    JOIN products p ON p.id = ii.product_id
    WHERE i.status = 'active'
    UNION ALL
    SELECT date(x.return_date),
           -(x.refund_amount - x.tax_refund),
           -CASE WHEN x.condition = 'resellable'
                 THEN CAST(ROUND(x.cost_price * x.cum_qty * 1.0 / x.pack_size) AS INTEGER)
                    - CAST(ROUND(x.cost_price * (x.cum_qty - x.qty) * 1.0 / x.pack_size) AS INTEGER)
                 ELSE 0 END
    FROM (
        SELECT r.return_date AS return_date, sri.refund_amount AS refund_amount, sri.tax_refund AS tax_refund, sri.condition AS condition,
               sri.qty AS qty, ii.cost_price AS cost_price, p.pack_size AS pack_size, i.status AS status,
               SUM(sri.qty) OVER (PARTITION BY sri.invoice_item_id ORDER BY r.created_at, sri.rowid) AS cum_qty
        FROM sales_return_items sri
        JOIN sales_returns r ON r.id = sri.sales_return_id
        JOIN invoice_items ii ON ii.id = sri.invoice_item_id
        JOIN invoices i ON i.id = r.invoice_id
        JOIN products p ON p.id = ii.product_id
    ) x
    WHERE x.status = 'active'
)
GROUP BY day;
