-- =====================================================================
-- 005: three loose ends of the sales side.
--
--  1. sales_return_items.tax_refund    The tax inside each returned line's refund. The return service works it out (the same
--                                      running-difference way as the refund) and stores it, and v_profit_by_day uses it, so
--                                      the profit of a return matches its refund to the paisa (it used to be re-derived by a
--                                      ratio and could be 1 paisa off).
--  2. v_low_stock, v_group_stock       A size is low only when it HAS a minimum (min_stock > 0) and its sellable stock is at or
--                                      below it. This is what the Products screen already said; the views now agree with it.
--  3. invoice_items.name_en / name_ur  The display name of the size (group name + size label, in English and Urdu) AS IT WAS AT
--                                      SALE TIME. Set by the sale service, never edited, used by receipts and reprints, so a
--                                      later rename of a product cannot change an old receipt.
--
-- No table is rebuilt: columns are added, three views are replaced, triggers are added.
--
-- invoice_items and sales_return_items are append-only (a trigger refuses UPDATE), so the BACKFILL has to switch that trigger off
-- for a moment and put the identical one back, all inside this migration's transaction. Nothing else can run in between.
--
-- Existing rows:
--   tax_refund   Each existing return row gets its share of the line's tax as a running difference (cumulative tax for the quantity
--                returned so far, minus what earlier returns already got; integer arithmetic, halves up: exactly roundDiv in
--                packages/core/src/money). That is what the service would have stored. The sum over all returns of a line can never
--                pass the tax charged on the line (the guard triggers below check it during the backfill too).
--   names        Each existing line gets the product's CURRENT display name. The name at sale time was never stored, so a product that
--                was renamed before this migration shows its new name on old lines; every sale from now on keeps its own.
--
-- Every row the backfill changes gets version = version + 1 (these two tables have no version trigger, being append-only), and a
-- change_log 'update' row, but only when that row's insert was already synced: an unsynced insert will carry the final row anyway.
--
-- A tax_refund CAN exceed its own refund_amount by a paisa or so (the two running differences round separately: a line_total of 2
-- over 3 units with tax 1 refunds 1, 0, 1 and its tax 0, 1, 0). So the guard is on the total tax of the line, not on each row.
-- =====================================================================

-- ---------- 1. tax_refund ----------
ALTER TABLE sales_return_items ADD COLUMN tax_refund INTEGER NOT NULL DEFAULT 0 CHECK (tax_refund >= 0);

-- All the tax refunded on one line can never pass the tax charged on it.
CREATE TRIGGER trg_sri_tax_refund_cap BEFORE INSERT ON sales_return_items
WHEN NEW.tax_refund > 0
 AND COALESCE((SELECT SUM(tax_refund) FROM sales_return_items WHERE invoice_item_id = NEW.invoice_item_id), 0) + NEW.tax_refund
     > COALESCE((SELECT tax_amount FROM invoice_items WHERE id = NEW.invoice_item_id), 0)
BEGIN SELECT RAISE(ABORT, 'sales_return_items: the tax refunded on a line cannot pass the tax charged on it'); END;

CREATE TRIGGER trg_sri_tax_refund_cap_update BEFORE UPDATE OF tax_refund ON sales_return_items
WHEN NEW.tax_refund > 0
 AND COALESCE((SELECT SUM(tax_refund) FROM sales_return_items WHERE invoice_item_id = NEW.invoice_item_id AND id <> NEW.id), 0) + NEW.tax_refund
     > COALESCE((SELECT tax_amount FROM invoice_items WHERE id = NEW.invoice_item_id), 0)
BEGIN SELECT RAISE(ABORT, 'sales_return_items: the tax refunded on a line cannot pass the tax charged on it'); END;

-- The backfill needs to UPDATE an append-only table: the trigger goes away for this one statement and comes straight back.
DROP TRIGGER trg_sales_return_items_no_update;

WITH running AS (
    SELECT sri.id AS id,
           sri.invoice_item_id AS item_id,
           SUM(sri.qty) OVER (PARTITION BY sri.invoice_item_id ORDER BY r.created_at, sri.rowid) AS cum_qty,
           -- round(tax_amount * cum_qty / qty), halves up, in integers
           (2 * ii.tax_amount * SUM(sri.qty) OVER (PARTITION BY sri.invoice_item_id ORDER BY r.created_at, sri.rowid) + ii.qty) / (2 * ii.qty) AS cum_tax
    FROM sales_return_items sri
    JOIN sales_returns r ON r.id = sri.sales_return_id
    JOIN invoice_items ii ON ii.id = sri.invoice_item_id
), shares AS (
    SELECT id, cum_tax - LAG(cum_tax, 1, 0) OVER (PARTITION BY item_id ORDER BY cum_qty) AS share
    FROM running
)
UPDATE sales_return_items
   SET tax_refund = shares.share,
       version = sales_return_items.version + 1
  FROM shares
 WHERE sales_return_items.id = shares.id
   AND shares.share <> 0;

INSERT INTO change_log (id, table_name, row_id, operation)
SELECT lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))),
       'sales_return_items', sri.id, 'update'
FROM sales_return_items sri
WHERE sri.tax_refund <> 0
  AND EXISTS (SELECT 1 FROM change_log c WHERE c.table_name = 'sales_return_items' AND c.row_id = sri.id AND c.operation = 'insert' AND c.synced_at IS NOT NULL);

CREATE TRIGGER trg_sales_return_items_no_update BEFORE UPDATE ON sales_return_items
BEGIN SELECT RAISE(ABORT, 'sales_return_items is append-only: add a reversing row instead'); END;

-- ---------- 3. the name of the size at sale time ----------
ALTER TABLE invoice_items ADD COLUMN name_en TEXT;
ALTER TABLE invoice_items ADD COLUMN name_ur TEXT;

DROP TRIGGER trg_invoice_items_no_update;

UPDATE invoice_items
   SET name_en = (SELECT p.name_en FROM products p WHERE p.id = invoice_items.product_id),
       name_ur = (SELECT p.name_ur FROM products p WHERE p.id = invoice_items.product_id),
       version = version + 1
 WHERE EXISTS (SELECT 1 FROM products p WHERE p.id = invoice_items.product_id AND (p.name_en IS NOT NULL OR p.name_ur IS NOT NULL));

INSERT INTO change_log (id, table_name, row_id, operation)
SELECT lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))),
       'invoice_items', ii.id, 'update'
FROM invoice_items ii
WHERE (ii.name_en IS NOT NULL OR ii.name_ur IS NOT NULL)
  AND EXISTS (SELECT 1 FROM change_log c WHERE c.table_name = 'invoice_items' AND c.row_id = ii.id AND c.operation = 'insert' AND c.synced_at IS NOT NULL);

CREATE TRIGGER trg_invoice_items_no_update BEFORE UPDATE ON invoice_items
BEGIN SELECT RAISE(ABORT, 'invoice_items is append-only: add a reversing row instead'); END;

-- A new invoice line must say what was sold, in at least one language.
CREATE TRIGGER trg_ii_has_name BEFORE INSERT ON invoice_items
WHEN COALESCE(NEW.name_en, '') = '' AND COALESCE(NEW.name_ur, '') = ''
BEGIN SELECT RAISE(ABORT, 'invoice_items: a line needs the name of the product as it was at sale time'); END;

-- ---------- 2. views ----------
DROP VIEW v_low_stock;
CREATE VIEW v_low_stock AS
SELECT * FROM v_product_stock WHERE is_active = 1 AND min_stock > 0 AND stock_sellable <= min_stock;

DROP VIEW v_group_stock;
CREATE VIEW v_group_stock AS
SELECT g.id AS group_id, g.name_en, g.name_ur, g.is_active,
       COUNT(ps.product_id) AS size_count,
       MIN(ps.base_unit) AS base_unit,
       COALESCE(SUM(ps.stock_total), 0) AS stock_total,
       COALESCE(SUM(ps.stock_sellable), 0) AS stock_sellable,
       COALESCE(SUM(CASE WHEN ps.is_active = 1 AND ps.min_stock > 0 AND ps.stock_sellable <= ps.min_stock THEN 1 ELSE 0 END), 0) AS low_size_count
FROM product_groups g
LEFT JOIN v_product_stock ps ON ps.group_id = g.id
WHERE g.deleted_at IS NULL
GROUP BY g.id;

-- A return takes back the revenue it refunded WITHOUT the tax inside the refund: the tax was never revenue.
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
    SELECT date(r.return_date),
           -(sri.refund_amount - sri.tax_refund),
           -CASE WHEN sri.condition = 'resellable'
                 THEN CAST(ROUND(ii.cost_price * sri.qty * 1.0 / p.pack_size) AS INTEGER) ELSE 0 END
    FROM sales_return_items sri
    JOIN sales_returns r ON r.id = sri.sales_return_id
    JOIN invoice_items ii ON ii.id = sri.invoice_item_id
    JOIN invoices i ON i.id = r.invoice_id
    JOIN products p ON p.id = ii.product_id
    WHERE i.status = 'active'
)
GROUP BY day;
