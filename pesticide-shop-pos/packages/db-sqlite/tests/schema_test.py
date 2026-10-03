"""Loads every migration (001, 002, ...) in order into an in-memory SQLite database and checks the business rules.

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
MIGRATIONS = os.path.join(HERE, "..", "migrations")
for name in sorted(f for f in os.listdir(MIGRATIONS) if f.endswith(".sql")):
    db.executescript(open(os.path.join(MIGRATIONS, name), encoding="utf8").read())

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

g_bottle = ins("product_groups", name_en="Insecticide 1L", name_ur="کیڑے مار")
bottle = ins("products", group_id=g_bottle, name_en="Insecticide 1L", name_ur="کیڑے مار", sku="INS1L", base_unit="ml",
             pack_size=1000, allow_loose=0, retail_price=50_000, wholesale_price=45_000, min_stock=5000)
b1 = ins("batches", product_id=bottle, supplier_id=sup, batch_no="B-001", expiry_date=future, cost_price=40_000)
b_old = ins("batches", product_id=bottle, supplier_id=sup, batch_no="B-OLD", expiry_date=past, cost_price=40_000)

g_loose = ins("product_groups", name_en="Fertilizer 1kg", name_ur="کھاد")
loose = ins("products", group_id=g_loose, name_en="Fertilizer 1kg", name_ur="کھاد", base_unit="g", pack_size=1000,
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

print("\n--- product groups and sizes (migration 004) ---")
# Insecticide X: a 250 ml size that is low on stock and a 1 L size that is not, each with its own batch.
x_group = ins("product_groups", name_en="Insecticide X", name_ur="کیڑے مار دوا ایکس")
x250 = ins("products", group_id=x_group, pack_label="250 ml", name_en="Insecticide X 250 ml", name_ur="کیڑے مار دوا ایکس 250 ml",
           barcode="8961000250250", base_unit="ml", pack_size=250, retail_price=14_500, wholesale_price=13_000, min_stock=1000)
x1l = ins("products", group_id=x_group, pack_label="1 L", name_en="Insecticide X 1 L", name_ur="کیڑے مار دوا ایکس 1 L",
          barcode="8961000251000", base_unit="ml", pack_size=1000, retail_price=50_000, wholesale_price=45_000, min_stock=2000)
xb250 = ins("batches", product_id=x250, batch_no="X-250", expiry_date=future, cost_price=11_500)
xb1l = ins("batches", product_id=x1l, batch_no="X-1L", expiry_date=future, cost_price=40_000)
xb1l_old = ins("batches", product_id=x1l, batch_no="X-1L-OLD", expiry_date=past, cost_price=40_000)
ins("stock_movements", batch_id=xb250, qty_delta=600, movement_type="purchase", created_by=owner)
ins("stock_movements", batch_id=xb1l, qty_delta=5000, movement_type="purchase", created_by=owner)
ins("stock_movements", batch_id=xb1l_old, qty_delta=300, movement_type="purchase", created_by=owner)
dormant = ins("product_groups", name_en="Dormant product", is_active=0)
dormant_size = ins("products", group_id=dormant, name_en="Dormant product", base_unit="ml", pack_size=100,
                   retail_price=1, wholesale_price=1, is_active=0)

rows = [dict(r) for r in db.execute("SELECT product_id, pack_label, group_name_en, stock_total, stock_sellable FROM v_product_stock WHERE group_id=? ORDER BY pack_size", (x_group,))]
check("every size keeps its own stock (the expired 300 ml is not sellable)", rows == [
    {"product_id": x250, "pack_label": "250 ml", "group_name_en": "Insecticide X", "stock_total": 600, "stock_sellable": 600},
    {"product_id": x1l, "pack_label": "1 L", "group_name_en": "Insecticide X", "stock_total": 5300, "stock_sellable": 5000}], rows)
check("low stock is per size: the 250 ml is low", one("SELECT COUNT(*) c FROM v_low_stock WHERE product_id=?", x250)["c"] == 1)
check("low stock is per size: the 1 L is not", one("SELECT COUNT(*) c FROM v_low_stock WHERE product_id=?", x1l)["c"] == 0)
gs = dict(one("SELECT size_count, base_unit, stock_total, stock_sellable, low_size_count FROM v_group_stock WHERE group_id=?", x_group))
check("v_group_stock adds the sizes up", gs == {"size_count": 2, "base_unit": "ml", "stock_total": 5900, "stock_sellable": 5600, "low_size_count": 1}, gs)
empty = ins("product_groups", name_en="Empty product")
check("a product with no sizes shows in v_group_stock with zero stock",
      dict(one("SELECT size_count, stock_total FROM v_group_stock WHERE group_id=?", empty)) == {"size_count": 0, "stock_total": 0})

check("v_product_group_mismatch is empty while copies match", db.execute("SELECT * FROM v_product_group_mismatch").fetchall() == [])
db.execute("UPDATE product_groups SET name_en='Insecticide Y' WHERE id=?", (x_group,))
check("renaming a group without its sizes is caught by v_product_group_mismatch",
      sorted(r["product_id"] for r in db.execute("SELECT product_id FROM v_product_group_mismatch")) == sorted([x250, x1l]))
db.execute("UPDATE product_groups SET name_en='Insecticide X' WHERE id=?", (x_group,))
check("...and is empty again once the name is back", db.execute("SELECT * FROM v_product_group_mismatch").fetchall() == [])
cat = ins("categories", name_en="Insecticide")
db.execute("UPDATE product_groups SET category_id=? WHERE id=?", (cat, x_group))
check("a drifted category copy is caught", one("SELECT COUNT(*) c FROM v_product_group_mismatch")["c"] == 2)
db.execute("UPDATE products SET category_id=? WHERE group_id=?", (cat, x_group))
check("...and cleared by copying it", one("SELECT COUNT(*) c FROM v_product_group_mismatch")["c"] == 0)
db.execute("UPDATE product_groups SET category_id=NULL WHERE id=?", (x_group,))
db.execute("UPDATE products SET category_id=NULL WHERE group_id=?", (x_group,))

def insert_size(**vals):
    base = dict(name_en="X", base_unit="ml", pack_size=100, retail_price=1, wholesale_price=1)
    base.update(vals)
    return lambda: ins("products", **base)

expect_fail("a size with no group is blocked", insert_size(group_id=None), "group_id is required")
expect_fail("a size with no group_id at all is blocked", insert_size(), "group_id is required")
expect_fail("taking a size out of its group is blocked", lambda: db.execute("UPDATE products SET group_id=NULL WHERE id=?", (x250,)), "group_id is required")
expect_fail("a size with a different unit in the same group is blocked", insert_size(group_id=x_group, pack_label="500 g", base_unit="g"), "same base unit")
expect_fail("changing a size to a different unit than its group-mates is blocked", lambda: db.execute("UPDATE products SET base_unit='g' WHERE id=?", (x250,)), "same base unit")
expect_fail("two sizes with the same label are blocked", insert_size(group_id=x_group, pack_label="250 ml"), "unique")
expect_fail("a second size with no label is blocked", insert_size(group_id=x_group, pack_label=""), "pack label")
expect_fail("a labelled size beside an unlabelled one is blocked", insert_size(group_id=g_bottle, pack_label="500 ml"), "pack label")
expect_fail("removing the label of a size that has company is blocked", lambda: db.execute("UPDATE products SET pack_label='' WHERE id=?", (x250,)), "pack label")
expect_fail("an active size inside an inactive product is blocked", insert_size(group_id=dormant, pack_label="", is_active=1), "inactive")
expect_fail("switching a size on inside an inactive product is blocked", lambda: db.execute("UPDATE products SET is_active=1 WHERE id=?", (dormant_size,)), "inactive")
gone = ins("product_groups", name_en="Gone", deleted_at="2026-01-01T00:00:00.000Z")
expect_fail("a live size inside a deleted product is blocked", insert_size(group_id=gone), "deleted or inactive")
expect_fail("deactivating a product that still has active sizes is blocked", lambda: db.execute("UPDATE product_groups SET is_active=0 WHERE id=?", (x_group,)), "deactivate its sizes first")
expect_fail("deleting a product that still has sizes is blocked", lambda: db.execute("UPDATE product_groups SET deleted_at='2026-01-01T00:00:00.000Z' WHERE id=?", (x_group,)), "still has sizes")
expect_fail("hard-deleting a product group is blocked", lambda: db.execute("DELETE FROM product_groups WHERE id=?", (x_group,)), "hard delete")
expect_fail("a group with no name at all is blocked", lambda: ins("product_groups", name_en=None, name_ur=None), "check constraint")

solo = ins("product_groups", name_en="Solo")
insert_size(group_id=solo, pack_label="", name_en="Solo")()
db.execute("UPDATE products SET pack_label='100 ml' WHERE group_id=?", (solo,))
try:
    insert_size(group_id=solo, pack_label="200 ml", name_en="Solo 200 ml", pack_size=200)()
    check("an unlabelled size is fine alone, and a second size is fine once both have labels", True)
except sqlite3.Error as e:
    check("an unlabelled size is fine alone, and a second size is fine once both have labels", False, str(e))

home = ins("product_groups", name_en="Home")
mover = insert_size(group_id=home, pack_label="", name_en="Home")()
db.execute("UPDATE products SET group_id=?, pack_label='100 ml' WHERE id=?", (x_group, mover))
check("a size can move to another product", one("SELECT group_id FROM products WHERE id=?", mover)["group_id"] == x_group)
db.execute("UPDATE product_groups SET is_active=0 WHERE id=?", (home,))
check("a product left with no sizes can be switched off", one("SELECT is_active FROM product_groups WHERE id=?", home)["is_active"] == 0)

check("groups are logged for sync", one("SELECT COUNT(*) c FROM change_log WHERE table_name='product_groups' AND operation='insert' AND row_id=?", x_group)["c"] == 1)
v_before = one("SELECT version FROM product_groups WHERE id=?", x_group)["version"]
db.execute("UPDATE product_groups SET notes='x' WHERE id=?", (x_group,))
check("an update to a group bumps its version", one("SELECT version FROM product_groups WHERE id=?", x_group)["version"] == v_before + 1)

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
