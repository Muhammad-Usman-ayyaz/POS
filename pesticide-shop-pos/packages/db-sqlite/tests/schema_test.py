"""Loads 001_init.sql into an in-memory SQLite database and checks the business rules.

Run:  python test_database.py
"""
import os
import sqlite3
import sys
import uuid
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
db = sqlite3.connect(":memory:", isolation_level=None)
db.row_factory = sqlite3.Row
db.execute("PRAGMA foreign_keys = ON")
db.executescript(open(os.path.join(HERE, "..", "migrations", "001_init.sql")).read())

passed = failed = 0


def check(label, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"PASS  {label}")
    else:
        failed += 1
        print(f"FAIL  {label}  {detail}")


def expect_fail(label, fn, contains):
    try:
        fn()
    except sqlite3.Error as e:
        check(label, contains.lower() in str(e).lower(), f"got: {e}")
    else:
        check(label, False, "no error was raised")


ctx = {}


def ins(table, **vals):
    cols = [r["name"] for r in db.execute(f"PRAGMA table_info({table})")]
    if "id" in cols and "id" not in vals:
        vals["id"] = str(uuid.uuid4())
    for c in ("shop_id", "branch_id", "device_id"):
        if c in cols and c not in vals and c in ctx:
            vals[c] = ctx[c]
    names = ", ".join(f'"{k}"' for k in vals)
    marks = ", ".join("?" for _ in vals)
    db.execute(f"INSERT INTO {table} ({names}) VALUES ({marks})", list(vals.values()))
    return vals.get("id")


def one(sql, *args):
    return db.execute(sql, args).fetchone()


def stock(batch):
    return one("SELECT stock FROM v_batch_stock WHERE batch_id=?", batch)["stock"]


def balance(customer):
    return one("SELECT balance FROM v_customer_balance WHERE customer_id=?", customer)["balance"]


# ---------------- seed ----------------
ctx["shop_id"] = ins("shops", name="Pesticide Club Shop")
ctx["branch_id"] = ins("branches", shop_id=ctx["shop_id"], name="Main", code="A")
ctx["device_id"] = ins("devices", branch_id=ctx["branch_id"], name="Counter PC", device_code="A1")
owner = ins("users", name="Owner", username="owner", password_hash="x", role="owner")
staff = ins("users", name="Salesman", username="staff", password_hash="x", role="staff")
sup = ins("suppliers", name_en="Agri Dealer", name_ur="ایگری ڈیلر")
cust = ins("customers", name_en="Rashid", name_ur="راشد", village="Kot", credit_limit=1_000_000)

future = (date.today() + timedelta(days=365)).isoformat()
soon = (date.today() + timedelta(days=10)).isoformat()
past = "2020-01-01"

bottle = ins("products", name_en="Insecticide 1L", name_ur="کیڑے مار", sku="INS1L", base_unit="ml",
             pack_size=1000, allow_loose=0, retail_price=50_000, wholesale_price=45_000, min_stock=5000)
b1 = ins("batches", product_id=bottle, supplier_id=sup, batch_no="B-001", expiry_date=future, cost_price=40_000)
b_old = ins("batches", product_id=bottle, supplier_id=sup, batch_no="B-OLD", expiry_date=past, cost_price=40_000)

loose = ins("products", name_en="Fertilizer 1kg", name_ur="کھاد", base_unit="g", pack_size=1000,
            allow_loose=1, retail_price=20_000, wholesale_price=18_000)
b2 = ins("batches", product_id=loose, batch_no="F-001", expiry_date=future, cost_price=15_000)
b3 = ins("batches", product_id=loose, batch_no="F-NEAR", expiry_date=soon, cost_price=15_000)

# purchase of 20 bottles
pur = ins("purchases", supplier_id=sup, total=800_000, paid_amount=800_000)
ins("purchase_items", purchase_id=pur, batch_id=b1, qty=20_000, cost_price=40_000)
ins("stock_movements", batch_id=b1, qty_delta=20_000, movement_type="purchase", ref_type="purchase", ref_id=pur, created_by=owner)
ins("stock_movements", batch_id=b_old, qty_delta=1_000, movement_type="purchase", created_by=owner)
ins("stock_movements", batch_id=b2, qty_delta=10_000, movement_type="purchase", created_by=owner)
ins("stock_movements", batch_id=b3, qty_delta=100, movement_type="purchase", created_by=owner)

print("\n--- stock ---")
check("stock after purchase is 20000 ml", stock(b1) == 20_000, stock(b1))

# sale: 10 bottles at Rs 500 on credit, Rs 2000 paid
inv = ins("invoices", invoice_no="INV-A-000001", customer_id=cust, created_by=staff,
          subtotal=500_000, total=500_000, paid_amount=200_000, due_date=future)
ii = ins("invoice_items", invoice_id=inv, product_id=bottle, batch_id=b1, qty=10_000,
         unit_price=50_000, cost_price=40_000, line_total=500_000)
ins("stock_movements", batch_id=b1, qty_delta=-10_000, movement_type="sale", ref_type="invoice", ref_id=inv, created_by=staff)
ins("ledger_entries", party_type="customer", party_id=cust, entry_type="invoice", amount_delta=500_000, ref_type="invoice", ref_id=inv)
ins("payments", party_type="customer", party_id=cust, method="cash", amount=200_000, direction="in")
ins("ledger_entries", party_type="customer", party_id=cust, entry_type="payment", amount_delta=-200_000)

print("\n--- sale ---")
check("stock after sale is 10000 ml", stock(b1) == 10_000, stock(b1))
check("customer owes Rs 3000 (300000 paisa)", balance(cust) == 300_000, balance(cust))
check("invoice total matches its lines", one("SELECT COUNT(*) c FROM v_invoice_mismatch")["c"] == 0)

# return 2 bottles, resellable, credited to Khata
ret = ins("sales_returns", return_no="RET-A-000001", invoice_id=inv, approved_by=owner,
          refund_method="khata_credit", total=100_000)
ins("sales_return_items", sales_return_id=ret, invoice_item_id=ii, qty=2_000, refund_amount=100_000, condition="resellable")
ins("stock_movements", batch_id=b1, qty_delta=2_000, movement_type="sale_return", ref_type="return", ref_id=ret, created_by=owner)
ins("ledger_entries", party_type="customer", party_id=cust, entry_type="return", amount_delta=-100_000, ref_type="return", ref_id=ret)

print("\n--- return ---")
check("stock after return is 12000 ml", stock(b1) == 12_000, stock(b1))
check("customer now owes Rs 2000", balance(cust) == 200_000, balance(cust))
r = one("SELECT qty_returned, qty_returnable FROM v_invoice_item_returnable WHERE invoice_item_id=?", ii)
check("8000 ml still returnable", (r["qty_returned"], r["qty_returnable"]) == (2_000, 8_000), tuple(r))
p = one("SELECT revenue, cost, profit FROM v_profit_by_day")
check("net sales 4000, cost 3200, profit 800 (in paisa)",
      (p["revenue"], p["cost"], p["profit"]) == (400_000, 320_000, 80_000), tuple(p))

print("\n--- rules that must refuse ---")
expect_fail("returning more than was sold is blocked",
            lambda: ins("sales_return_items", sales_return_id=ret, invoice_item_id=ii, qty=9_000, refund_amount=1, condition="resellable"),
            "return exceeds")
expect_fail("selling more than the stock is blocked",
            lambda: ins("stock_movements", batch_id=b1, qty_delta=-99_000, movement_type="sale"),
            "insufficient stock")
expect_fail("selling from an expired batch is blocked",
            lambda: ins("stock_movements", batch_id=b_old, qty_delta=-1_000, movement_type="sale"),
            "expired")
expect_fail("loose quantity of a pack-only product is blocked",
            lambda: ins("invoice_items", invoice_id=inv, product_id=bottle, batch_id=b1, qty=250,
                        unit_price=50_000, cost_price=40_000, line_total=12_500),
            "whole packs")
expect_fail("batch from a different product is blocked",
            lambda: ins("invoice_items", invoice_id=inv, product_id=loose, batch_id=b1, qty=1000,
                        unit_price=20_000, cost_price=15_000, line_total=20_000),
            "does not belong")
expect_fail("walk-in credit sale is blocked",
            lambda: ins("invoices", invoice_no="INV-A-000099", created_by=staff, subtotal=1000, total=1000, paid_amount=0),
            "check constraint")
expect_fail("negative price is blocked",
            lambda: db.execute("UPDATE products SET retail_price = -1 WHERE id=?", (bottle,)),
            "check constraint")
expect_fail("payment to an unknown party is blocked",
            lambda: ins("payments", party_type="customer", party_id=str(uuid.uuid4()), method="cash", amount=1, direction="in"),
            "unknown party")
expect_fail("editing a ledger entry is blocked",
            lambda: db.execute("UPDATE ledger_entries SET amount_delta = 1"), "append-only")
expect_fail("deleting a ledger entry is blocked",
            lambda: db.execute("DELETE FROM ledger_entries"), "append-only")
expect_fail("deleting a stock movement is blocked",
            lambda: db.execute("DELETE FROM stock_movements"), "append-only")
expect_fail("editing an invoice line is blocked",
            lambda: db.execute("UPDATE invoice_items SET qty = 1"), "append-only")
expect_fail("hard-deleting a product is blocked",
            lambda: db.execute("DELETE FROM products WHERE id=?", (bottle,)), "hard delete")
expect_fail("hard-deleting an invoice is blocked",
            lambda: db.execute("DELETE FROM invoices"), "hard delete")

print("\n--- loose sale ---")
inv2 = ins("invoices", invoice_no="INV-A-000002", created_by=staff, subtotal=5_000, total=5_000, paid_amount=5_000)
ins("invoice_items", invoice_id=inv2, product_id=loose, batch_id=b2, qty=250, unit_price=20_000, cost_price=15_000, line_total=5_000)
ins("stock_movements", batch_id=b2, qty_delta=-250, movement_type="sale", ref_type="invoice", ref_id=inv2)
check("250 g sold loose, 9750 g left", stock(b2) == 9_750, stock(b2))

print("\n--- void ---")
db.execute("UPDATE invoices SET status='voided', void_reason='entered by mistake', voided_by=? WHERE id=?", (owner, inv2))
check("invoice can be voided with a reason", one("SELECT status FROM invoices WHERE id=?", inv2)["status"] == "voided")
expect_fail("voided invoice without a reason is blocked",
            lambda: db.execute("UPDATE invoices SET status='voided', void_reason=NULL WHERE id=?", (inv,)),
            "check constraint")
expect_fail("return against a voided invoice is blocked",
            lambda: ins("sales_returns", return_no="RET-A-000002", invoice_id=inv2, approved_by=owner,
                        refund_method="cash", total=1),
            "voided")
expect_fail("adding a line to a voided invoice is blocked",
            lambda: ins("invoice_items", invoice_id=inv2, product_id=loose, batch_id=b2, qty=10,
                        unit_price=20_000, cost_price=15_000, line_total=200),
            "voided")

print("\n--- views ---")
check("expired stock shows the old batch", [r["batch_no"] for r in db.execute("SELECT batch_no FROM v_expired_stock")] == ["B-OLD"])
check("near-expiry (30 days) shows the 10-day batch", [r["batch_no"] for r in db.execute("SELECT batch_no FROM v_near_expiry")] == ["F-NEAR"])
ps = one("SELECT stock_total, stock_sellable FROM v_product_stock WHERE product_id=?", bottle)
check("expired batch is not counted as sellable", (ps["stock_total"], ps["stock_sellable"]) == (13_000, 12_000), tuple(ps))
check("low stock is empty at 12000 vs min 5000", one("SELECT COUNT(*) c FROM v_low_stock WHERE product_id=?", bottle)["c"] == 0)
db.execute("UPDATE products SET min_stock = 20000 WHERE id=?", (bottle,))
check("low stock appears when minimum is raised", one("SELECT COUNT(*) c FROM v_low_stock WHERE product_id=?", bottle)["c"] == 1)

print("\n--- sync support ---")
v = one("SELECT version FROM products WHERE id=?", bottle)["version"]
check("update bumped the version from 1 to 2", v == 2, v)
n_unsynced = one("SELECT COUNT(*) c FROM change_log WHERE synced_at IS NULL")["c"]
check("changes were logged for sync", n_unsynced > 20, n_unsynced)
db.execute("UPDATE change_log SET synced_at = datetime('now') WHERE table_name='products'")
check("synced_at can be set", one("SELECT COUNT(*) c FROM change_log WHERE synced_at IS NOT NULL")["c"] > 0)
expect_fail("change_log content cannot be edited",
            lambda: db.execute("UPDATE change_log SET row_id = 'x'"), "append-only")
expect_fail("unsynced change_log rows cannot be deleted",
            lambda: db.execute("DELETE FROM change_log WHERE synced_at IS NULL"), "not synced")

print("\n--- integrity ---")
check("PRAGMA integrity_check is ok", one("PRAGMA integrity_check")[0] == "ok")
check("no foreign key violations", db.execute("PRAGMA foreign_key_check").fetchall() == [])

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
