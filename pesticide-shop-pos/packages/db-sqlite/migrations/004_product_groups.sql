-- =====================================================================
-- 004: one product, several pack sizes (open question 1).
--
-- A PRODUCT GROUP is what the shopkeeper thinks of as one product ("Product A"). Each of its SIZES
-- (250 ml, 500 ml, 1 L) is still a row in `products`, so batches, stock movements, invoice lines and every
-- foreign key are unchanged: every size keeps its own stock, batches, prices, tax rate, barcode and min_stock.
--
--   product_groups   the parent: names, category, brand, notes. The source of truth for those.
--   products         + group_id   which group the size belongs to (never NULL, see below)
--                    + pack_label the size as people say it, "500 ml". Empty only while a group has one size.
--
-- DENORMALIZED COPIES. products.name_en / name_ur / category_id / brand_id are copies of the group's values:
--     name_en = group name_en                          (when pack_label is empty)
--     name_en = group name_en || ' ' || pack_label     (otherwise), and the same for name_ur
--     category_id, brand_id = the group's
-- The catalogue service writes them, so invoices, error messages and views that read products.name_* keep
-- working. v_product_group_mismatch lists any size where a copy has drifted; it must stay empty.
--
-- group_id IS NEVER NULL, but the column is declared nullable. SQLite cannot add a NOT NULL column that
-- references another table, and rebuilding `products` (which every other table points at) needs foreign keys
-- switched off outside the migration transaction. Two triggers refuse a NULL group_id on insert and on update,
-- which is the same guarantee. (The core drift test names this one exception.)
--
-- Existing data: every product gets its own group (a fresh UUID), with the product's names, category, brand,
-- active flag and deleted_at. pack_label stays '' so existing names do not change. The backfill UPDATE
-- bumps each product's version and writes change_log rows, which is right: those rows did change.
-- =====================================================================

CREATE TABLE product_groups (
    id          TEXT PRIMARY KEY,
    name_en     TEXT,
    name_ur     TEXT,
    category_id TEXT REFERENCES categories(id),
    brand_id    TEXT REFERENCES brands(id),
    notes       TEXT,
    is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    shop_id    TEXT NOT NULL REFERENCES shops(id),
    branch_id  TEXT NOT NULL REFERENCES branches(id),
    device_id  TEXT NOT NULL REFERENCES devices(id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at TEXT,
    version    INTEGER NOT NULL DEFAULT 1,
    CHECK (name_en IS NOT NULL OR name_ur IS NOT NULL)
);
CREATE INDEX idx_product_groups_name_en ON product_groups(name_en);
CREATE INDEX idx_product_groups_name_ur ON product_groups(name_ur);

ALTER TABLE products ADD COLUMN group_id   TEXT REFERENCES product_groups(id);
ALTER TABLE products ADD COLUMN pack_label TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_products_group ON products(group_id);

-- ---------- group triggers: hard delete, change_log, version ----------

CREATE TRIGGER trg_product_groups_no_delete BEFORE DELETE ON product_groups
BEGIN SELECT RAISE(ABORT, 'product_groups: hard delete not allowed, set deleted_at instead'); END;

CREATE TRIGGER trg_product_groups_cl_ins AFTER INSERT ON product_groups
BEGIN
    INSERT INTO change_log (id, table_name, row_id, operation) VALUES (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))), 'product_groups', NEW.id, 'insert');
END;

CREATE TRIGGER trg_product_groups_cl_upd AFTER UPDATE ON product_groups
WHEN NEW.version = OLD.version
BEGIN
    UPDATE product_groups SET version = OLD.version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
    INSERT INTO change_log (id, table_name, row_id, operation) VALUES (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))), 'product_groups', NEW.id, 'update');
END;

-- ---------- backfill: one group per existing product ----------

CREATE TEMP TABLE _group_backfill (product_id TEXT PRIMARY KEY, group_id TEXT NOT NULL);

INSERT INTO _group_backfill (product_id, group_id)
SELECT id, lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))
FROM products;

INSERT INTO product_groups (id, name_en, name_ur, category_id, brand_id, is_active, shop_id, branch_id, device_id, deleted_at)
SELECT b.group_id, p.name_en, p.name_ur, p.category_id, p.brand_id, p.is_active, p.shop_id, p.branch_id, p.device_id, p.deleted_at
FROM products p JOIN _group_backfill b ON b.product_id = p.id;

UPDATE products SET group_id = (SELECT b.group_id FROM _group_backfill b WHERE b.product_id = products.id);

DROP TABLE _group_backfill;

-- ---------- products: the rules of sizes within a group ----------

-- group_id is required (the "NOT NULL" that SQLite cannot add to an existing table).
CREATE TRIGGER trg_products_group_id_required_ins BEFORE INSERT ON products
WHEN NEW.group_id IS NULL
BEGIN SELECT RAISE(ABORT, 'products: group_id is required (every size belongs to a product group)'); END;

CREATE TRIGGER trg_products_group_id_required_upd BEFORE UPDATE OF group_id ON products
WHEN NEW.group_id IS NULL
BEGIN SELECT RAISE(ABORT, 'products: group_id is required (every size belongs to a product group)'); END;

-- Sizes of one group share a base unit, so a group's stock can be added up (ml with ml, g with g).
CREATE TRIGGER trg_products_same_unit_ins BEFORE INSERT ON products
WHEN NEW.deleted_at IS NULL
 AND EXISTS (SELECT 1 FROM products o WHERE o.group_id = NEW.group_id AND o.deleted_at IS NULL AND o.base_unit <> NEW.base_unit)
BEGIN SELECT RAISE(ABORT, 'products: all sizes of one product must use the same base unit'); END;

CREATE TRIGGER trg_products_same_unit_upd BEFORE UPDATE OF group_id, base_unit, deleted_at ON products
WHEN NEW.deleted_at IS NULL
 AND EXISTS (SELECT 1 FROM products o WHERE o.group_id = NEW.group_id AND o.id <> NEW.id AND o.deleted_at IS NULL AND o.base_unit <> NEW.base_unit)
BEGIN SELECT RAISE(ABORT, 'products: all sizes of one product must use the same base unit'); END;

-- A size needs a label as soon as its group has more than one live size (an empty label is for a group of one).
CREATE TRIGGER trg_products_label_required_ins BEFORE INSERT ON products
WHEN NEW.deleted_at IS NULL
 AND EXISTS (SELECT 1 FROM products o WHERE o.group_id = NEW.group_id AND o.deleted_at IS NULL AND (NEW.pack_label = '' OR o.pack_label = ''))
BEGIN SELECT RAISE(ABORT, 'products: a product with several sizes needs a pack label on every size'); END;

CREATE TRIGGER trg_products_label_required_upd BEFORE UPDATE OF group_id, pack_label, deleted_at ON products
WHEN NEW.deleted_at IS NULL
 AND EXISTS (SELECT 1 FROM products o WHERE o.group_id = NEW.group_id AND o.id <> NEW.id AND o.deleted_at IS NULL AND (NEW.pack_label = '' OR o.pack_label = ''))
BEGIN SELECT RAISE(ABORT, 'products: a product with several sizes needs a pack label on every size'); END;

-- One label per size within a group.
CREATE UNIQUE INDEX uq_products_group_label ON products(group_id, pack_label) WHERE deleted_at IS NULL;

-- A live size needs a live group, and cannot be active inside an inactive group.
CREATE TRIGGER trg_products_group_live_ins BEFORE INSERT ON products
WHEN NEW.deleted_at IS NULL
 AND EXISTS (SELECT 1 FROM product_groups g WHERE g.id = NEW.group_id AND (g.deleted_at IS NOT NULL OR (g.is_active = 0 AND NEW.is_active = 1)))
BEGIN SELECT RAISE(ABORT, 'products: a size cannot be live or active inside a deleted or inactive product'); END;

CREATE TRIGGER trg_products_group_live_upd BEFORE UPDATE OF group_id, is_active, deleted_at ON products
WHEN NEW.deleted_at IS NULL
 AND EXISTS (SELECT 1 FROM product_groups g WHERE g.id = NEW.group_id AND (g.deleted_at IS NOT NULL OR (g.is_active = 0 AND NEW.is_active = 1)))
BEGIN SELECT RAISE(ABORT, 'products: a size cannot be live or active inside a deleted or inactive product'); END;

-- ---------- group lifecycle: no deactivating or deleting a group that still has sizes in use ----------

CREATE TRIGGER trg_product_groups_deactivate BEFORE UPDATE OF is_active ON product_groups
WHEN NEW.is_active = 0 AND OLD.is_active = 1
 AND EXISTS (SELECT 1 FROM products p WHERE p.group_id = NEW.id AND p.deleted_at IS NULL AND p.is_active = 1)
BEGIN SELECT RAISE(ABORT, 'product_groups: deactivate its sizes first'); END;

CREATE TRIGGER trg_product_groups_delete_with_sizes BEFORE UPDATE OF deleted_at ON product_groups
WHEN NEW.deleted_at IS NOT NULL
 AND EXISTS (SELECT 1 FROM products p WHERE p.group_id = NEW.id AND p.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'product_groups: cannot delete a product that still has sizes'); END;

-- ---------- views ----------
-- v_product_stock was already one row per SIZE (each size is a products row with its own min_stock), so the
-- low-stock view is per size too. The group columns are added at the end of the list.

DROP VIEW v_low_stock;
DROP VIEW v_product_stock;

CREATE VIEW v_product_stock AS
SELECT p.id AS product_id, p.name_en, p.name_ur, p.min_stock, p.is_active,
       COALESCE(SUM(s.stock), 0) AS stock_total,
       COALESCE(SUM(CASE WHEN s.expiry_date >= date('now') THEN s.stock ELSE 0 END), 0) AS stock_sellable,
       p.group_id, p.pack_label, p.pack_size, p.base_unit,
       g.name_en AS group_name_en, g.name_ur AS group_name_ur
FROM products p
JOIN product_groups g ON g.id = p.group_id
LEFT JOIN v_batch_stock s ON s.product_id = p.id
WHERE p.deleted_at IS NULL
GROUP BY p.id;

CREATE VIEW v_low_stock AS
SELECT * FROM v_product_stock WHERE is_active = 1 AND stock_sellable <= min_stock;

-- Stock of a whole product (all its sizes added up, in the base unit they share).
CREATE VIEW v_group_stock AS
SELECT g.id AS group_id, g.name_en, g.name_ur, g.is_active,
       COUNT(ps.product_id) AS size_count,
       MIN(ps.base_unit) AS base_unit,
       COALESCE(SUM(ps.stock_total), 0) AS stock_total,
       COALESCE(SUM(ps.stock_sellable), 0) AS stock_sellable,
       COALESCE(SUM(CASE WHEN ps.is_active = 1 AND ps.stock_sellable <= ps.min_stock THEN 1 ELSE 0 END), 0) AS low_size_count
FROM product_groups g
LEFT JOIN v_product_stock ps ON ps.group_id = g.id
WHERE g.deleted_at IS NULL
GROUP BY g.id;

-- Sizes whose copied names, category or brand no longer match their group. Must stay empty.
CREATE VIEW v_product_group_mismatch AS
SELECT p.id AS product_id, p.group_id, p.name_en, p.name_ur, p.category_id, p.brand_id
FROM products p
JOIN product_groups g ON g.id = p.group_id
WHERE p.deleted_at IS NULL
  AND (   p.name_en     IS NOT (CASE WHEN g.name_en IS NULL THEN NULL WHEN p.pack_label = '' THEN g.name_en ELSE g.name_en || ' ' || p.pack_label END)
       OR p.name_ur     IS NOT (CASE WHEN g.name_ur IS NULL THEN NULL WHEN p.pack_label = '' THEN g.name_ur ELSE g.name_ur || ' ' || p.pack_label END)
       OR p.category_id IS NOT g.category_id
       OR p.brand_id    IS NOT g.brand_id);
