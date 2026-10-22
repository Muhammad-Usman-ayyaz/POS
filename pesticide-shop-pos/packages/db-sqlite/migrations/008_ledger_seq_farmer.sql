-- =====================================================================
-- 008: a stable ledger sequence, and the farmer's land size and crop (Phase 6 wrap-up). Additive only.
--
--  1. ledger_entries.seq
--       An explicit, monotonic, per-file sequence for ledger rows, so order never depends on SQLite's rowid (which is only the order of
--       insertion on one PC). Before sync, rows from another device must not be able to slip between local ones.
--       - ledger_entries is append-only (UPDATE is refused by trigger trg_ledger_entries_no_update). That trigger is NOT touched, and no
--         existing row is rewritten: the column is added NULL and the rows that exist now KEEP seq = NULL.
--       - The ONE repository insert path assigns seq = (SELECT COALESCE(MAX(seq),0)+1 FROM ledger_entries WHERE seq IS NOT NULL) inside the
--         write transaction (SQLite serialises writers, so two rows cannot get the same number).
--       - The unique index below refuses a duplicate. The BEFORE INSERT trigger below refuses a NEW row with no seq, so no future code
--         path can forget it.
--       - ORDER RULE (everywhere a ledger is read in order):  ORDER BY (seq IS NOT NULL), seq, rowid
--         Old rows (NULL seq) come first in rowid order, which is exactly the order they always had; new rows follow in seq order.
--  2. customers.land_size, customers.crop
--       Optional farmer details, free text ('5 acres', 'Cotton'). Nullable, empty for every existing customer. Hidden by default behind
--       the setting customers.show_farmer_fields (like father_name, cnic, phone2, guarantor from 007).
-- =====================================================================

ALTER TABLE ledger_entries ADD COLUMN seq INTEGER;

CREATE UNIQUE INDEX uq_ledger_entries_seq ON ledger_entries(seq) WHERE seq IS NOT NULL;

CREATE TRIGGER trg_ledger_entries_seq_required BEFORE INSERT ON ledger_entries
WHEN NEW.seq IS NULL
BEGIN
    SELECT RAISE(ABORT, 'ledger_entries.seq is required: insert through the repository, which assigns the next sequence number');
END;

ALTER TABLE customers ADD COLUMN land_size TEXT;
ALTER TABLE customers ADD COLUMN crop TEXT;
