-- =====================================================================
-- 003: owner recovery code.
--
-- At first launch the app makes a one-time recovery code for the owner and shows it once. Only a HASH of it
-- is stored, here. The code lets the owner reset a forgotten password. It is replaced every time it is used
-- (or regenerated), so an old code stops working.
-- NULL means no recovery code has been set (for example a staff user, or a database made before this).
-- =====================================================================

ALTER TABLE users ADD COLUMN recovery_code_hash TEXT;
