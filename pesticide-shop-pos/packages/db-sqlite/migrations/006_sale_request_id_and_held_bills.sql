-- =====================================================================
-- 006: what the POS screen needs from the database (Phase 5).
--
--  1. invoices.request_id   A unique id the screen makes for each attempt to complete a sale. A second request with the same id (a
--                           double click, a retry after a crash or a restart) finds the invoice that already exists and gets that
--                           one back, instead of making a second invoice. The database enforces it with a unique index, so it holds
--                           across restarts and no matter what the code does. Once set it can never be changed.
--  2. held_bills            A bill put on hold at the counter, to be resumed later (even after the app was closed). It is a DRAFT of
--                           a cart, not a sale: it holds no stock, no price and no money. `payload` is the cart as the screen made
--                           it (product, quantity, batches chosen, discount), which is re-priced and re-checked when it is resumed.
--                           A held bill is written once and never edited: it is resumed or discarded, once.
--
-- held_bills is not written to change_log: a draft belongs to this counter and is not shared with other devices.
--
-- Existing invoices keep request_id NULL (the unique index ignores NULL), so nothing about them changes.
-- =====================================================================

-- ---------- 1. request_id ----------
ALTER TABLE invoices ADD COLUMN request_id TEXT CHECK (request_id IS NULL OR length(request_id) BETWEEN 8 AND 100);

CREATE UNIQUE INDEX uq_invoices_request_id ON invoices(request_id) WHERE request_id IS NOT NULL;

CREATE TRIGGER trg_invoices_request_id_fixed BEFORE UPDATE OF request_id ON invoices
WHEN OLD.request_id IS NOT NULL AND NEW.request_id IS NOT OLD.request_id
BEGIN SELECT RAISE(ABORT, 'invoices: request_id cannot be changed once it is set'); END;

-- ---------- 2. held_bills ----------
CREATE TABLE held_bills (
    id          TEXT PRIMARY KEY,
    held_by     TEXT NOT NULL REFERENCES users(id),
    customer_id TEXT REFERENCES customers(id),
    price_type  TEXT NOT NULL DEFAULT 'retail' CHECK (price_type IN ('retail','wholesale')),
    line_count  INTEGER NOT NULL CHECK (line_count > 0),
    payload     TEXT NOT NULL CHECK (json_valid(payload)),
    status      TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held','resumed','discarded')),
    resolved_by TEXT REFERENCES users(id),
    resolved_at TEXT,
    shop_id    TEXT NOT NULL REFERENCES shops(id),
    branch_id  TEXT NOT NULL REFERENCES branches(id),
    device_id  TEXT NOT NULL REFERENCES devices(id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at TEXT,
    version    INTEGER NOT NULL DEFAULT 1,
    -- who resolved it and when are set together with the status, and only then
    CHECK ((status = 'held' AND resolved_by IS NULL AND resolved_at IS NULL)
        OR (status <> 'held' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL))
);

CREATE INDEX idx_held_bills_status ON held_bills(status, created_at);

CREATE TRIGGER trg_held_bills_no_delete BEFORE DELETE ON held_bills
BEGIN SELECT RAISE(ABORT, 'held_bills: hard delete not allowed, resume or discard it instead'); END;

-- The cart is written once. Only the resolution (held to resumed or discarded) may change, and only once.
CREATE TRIGGER trg_held_bills_cart_fixed BEFORE UPDATE OF held_by, customer_id, price_type, line_count, payload ON held_bills
BEGIN SELECT RAISE(ABORT, 'held_bills: a held cart is not edited; resume or discard it'); END;

CREATE TRIGGER trg_held_bills_resolved_once BEFORE UPDATE OF status ON held_bills
WHEN OLD.status <> 'held'
BEGIN SELECT RAISE(ABORT, 'held_bills: this bill was already resumed or discarded'); END;

CREATE TRIGGER trg_held_bills_upd AFTER UPDATE ON held_bills
WHEN NEW.version = OLD.version
BEGIN
    UPDATE held_bills SET version = OLD.version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;
