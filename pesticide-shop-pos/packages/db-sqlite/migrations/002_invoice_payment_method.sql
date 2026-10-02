-- =====================================================================
-- 002: how the amount paid at sale was paid.
--
-- A walk-in sale writes no payments row (the cash lives on invoices.paid_amount), so without this column
-- there is nowhere to say whether a walk-in paid by cash, bank, Easypaisa or JazzCash.
-- For a customer sale the payments row uses the same method.
-- Existing invoices become 'cash', which is what the app assumed before this column existed.
-- =====================================================================

ALTER TABLE invoices ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash'
    CHECK (payment_method IN ('cash', 'bank', 'easypaisa', 'jazzcash'));
