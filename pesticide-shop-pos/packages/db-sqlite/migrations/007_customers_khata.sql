-- =====================================================================
-- 007: what the customers and Khata screens need from the database (Phase 6, M0). Additive only.
--
--  1. payments.note, payments.receipt_no
--       note        A free line the person types when taking a payment.
--       receipt_no  The payment receipt number, like RCP-A-000001. Set only when the payment is INSERTED (payments is append-only:
--                   the existing no-update trigger refuses any UPDATE, and adding a column does not change that). It is unique
--                   across the file, the same way invoices.invoice_no is (the branch code is inside the number).
--                   Payments that exist now keep a NULL receipt_no: nothing is rewritten.
--  2. customers.father_name, cnic, phone2, guarantor
--       The optional farmer details (open question 4). Nullable, empty for every existing customer. The screens show them only
--       when the setting customers.show_farmer_fields is on.
--  3. A 'payment' number sequence (prefix RCP-<branch code>-, starting at 0) for every device that already exists, copied from the
--     device's 'invoice' sequence. New shops get theirs from first-launch setup.
--
-- Settings: default_credit_limit and customers.show_farmer_fields need no row here. Like near_expiry_days and
-- staff_max_discount_percent, a missing row means the default in code (0 and off).
-- =====================================================================

-- ---------- 1. payments ----------
ALTER TABLE payments ADD COLUMN note TEXT;
ALTER TABLE payments ADD COLUMN receipt_no TEXT;

CREATE UNIQUE INDEX uq_payments_receipt_no ON payments(receipt_no) WHERE receipt_no IS NOT NULL;

-- ---------- 2. customers ----------
ALTER TABLE customers ADD COLUMN father_name TEXT;
ALTER TABLE customers ADD COLUMN cnic TEXT;
ALTER TABLE customers ADD COLUMN phone2 TEXT;
ALTER TABLE customers ADD COLUMN guarantor TEXT;

-- ---------- 3. the payment number sequence ----------
-- INV-A- becomes RCP-A-. A device that has no invoice sequence (not made by setup) gets RCP-<its branch code>-.
INSERT INTO number_sequences (id, device_id, sequence_name, prefix, last_number)
SELECT lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))),
       d.id,
       'payment',
       COALESCE(
           (SELECT 'RCP' || substr(s.prefix, 4) FROM number_sequences s
             WHERE s.device_id = d.id AND s.sequence_name = 'invoice' AND substr(s.prefix, 1, 4) = 'INV-'),
           'RCP-' || (SELECT b.code FROM branches b WHERE b.id = d.branch_id) || '-'),
       0
  FROM devices d
 WHERE NOT EXISTS (SELECT 1 FROM number_sequences p WHERE p.device_id = d.id AND p.sequence_name = 'payment');
