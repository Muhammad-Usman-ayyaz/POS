from datetime import date, timedelta
from decimal import Decimal

from rest_framework.test import APITestCase

from apps.accounts.models import User, UserRole
from apps.catalog.models import Batch, Brand, Category, Product
from apps.customers.models import Customer
from apps.khata.models import KhataCharge, KhataPayment
from apps.sales.services import create_sale, cancel_sale
from apps.suppliers.models import Supplier
from apps.purchases.models import Purchase, PurchaseItem, SupplierPayment

SUMMARY = '/api/reports/dashboard-summary/'
TREND = '/api/reports/sales-trend/'
BY_CATEGORY = '/api/reports/sales-by-category/'
TOP_PRODUCTS = '/api/reports/top-products/'


def make_user(role, email=None):
    return User.objects.create_user(email=email or f'{role.lower()}@x.com', password='S3cure-pass!', name=role.title(), role=role)


class ReportsTestBase(APITestCase):
    def setUp(self):
        self.owner = make_user(UserRole.OWNER)
        self.client.force_authenticate(self.owner)
        self.category = Category.objects.get(name='Insecticide')
        self.brand = Brand.objects.get(name='Syngenta Ag')
        self.product = Product.objects.create(
            name='Coragen', sku='COR-1', category=self.category, brand=self.brand,
            selling_price=Decimal('100'), min_stock_level=Decimal('10'),
        )
        self.batch = Batch.objects.create(product=self.product, batch_no='B1', quantity=Decimal('50'))
        self.customer = Customer.objects.create(name='Chaudhry Riaz', credit_limit=Decimal('50000'))

    def make_sale(self, qty='5', unit_price='100', payment_method='CASH', customer=None, sale_date=None, discount='0'):
        return create_sale(
            customer=customer, sale_date=sale_date or date.today(), payment_method=payment_method,
            discount_amount=Decimal(discount), notes='', user=self.owner,
            lines=[{'product': self.product, 'batch': self.batch, 'quantity': Decimal(qty), 'unit_price': Decimal(unit_price)}],
        )


class DashboardSummaryTests(ReportsTestBase):
    def test_today_sales_total_reflects_discount(self):
        self.make_sale(qty='5', unit_price='100', discount='50')  # 500 - 50 = 450
        res = self.client.get(SUMMARY)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Decimal(res.data['today_sales_total']), Decimal('450'))
        self.assertEqual(res.data['today_sales_count'], 1)

    def test_cancelled_sale_excluded_from_today_total(self):
        sale = self.make_sale()
        cancel_sale(sale=sale, user=self.owner)
        res = self.client.get(SUMMARY)
        self.assertEqual(Decimal(res.data['today_sales_total']), Decimal('0'))
        self.assertEqual(res.data['today_sales_count'], 0)

    def test_khata_outstanding_total_and_customer_count(self):
        self.make_sale(payment_method='KHATA', customer=self.customer)  # charges 500
        KhataPayment.objects.create(customer=self.customer, amount=Decimal('200'), paid_on=date.today())
        res = self.client.get(SUMMARY)
        self.assertEqual(Decimal(res.data['khata_outstanding_total']), Decimal('300'))
        self.assertEqual(res.data['khata_outstanding_customers'], 1)

    def test_khata_customer_with_zero_balance_not_counted(self):
        KhataCharge.objects.create(customer=self.customer, amount=Decimal('100'), charge_date=date.today())
        KhataPayment.objects.create(customer=self.customer, amount=Decimal('100'), paid_on=date.today())
        res = self.client.get(SUMMARY)
        self.assertEqual(res.data['khata_outstanding_customers'], 0)

    def test_supplier_payables_total(self):
        supplier = Supplier.objects.create(name='Agri-Tech Ltd')
        purchase = Purchase.objects.create(supplier=supplier, purchase_date=date.today())
        PurchaseItem.objects.create(purchase=purchase, product=self.product, batch_no='PB1', quantity=Decimal('10'), unit_cost=Decimal('50'))
        SupplierPayment.objects.create(purchase=purchase, amount=Decimal('200'), paid_on=date.today())
        res = self.client.get(SUMMARY)
        self.assertEqual(Decimal(res.data['supplier_payables_total']), Decimal('300'))  # 500 - 200

    def test_low_stock_and_expiring_counts(self):
        Batch.objects.create(product=self.product, batch_no='LOW1', quantity=Decimal('5'))  # <= min_stock_level of 10
        Batch.objects.create(product=self.product, batch_no='EXP1', quantity=Decimal('3'), expiry_date=date.today() + timedelta(days=30))
        res = self.client.get(SUMMARY)
        self.assertGreaterEqual(res.data['low_stock_count'], 1)
        self.assertEqual(res.data['expiring_soon_count'], 1)

    def test_recent_sales_present(self):
        self.make_sale()
        res = self.client.get(SUMMARY)
        self.assertEqual(len(res.data['recent_sales']), 1)
        self.assertIn('INV-', res.data['recent_sales'][0]['invoice_no'])

    def test_salesman_can_view_summary(self):
        self.client.force_authenticate(make_user(UserRole.SALESMAN))
        self.assertEqual(self.client.get(SUMMARY).status_code, 200)


class SalesTrendTests(ReportsTestBase):
    def test_zero_filled_for_days_without_sales(self):
        self.make_sale(qty='2', unit_price='100')  # 200 today
        res = self.client.get(TREND, {'days': 7})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 7)
        totals = {row['date']: Decimal(row['total']) for row in res.data}
        self.assertEqual(totals[date.today().isoformat()], Decimal('200'))
        other_days_total = sum(v for k, v in totals.items() if k != date.today().isoformat())
        self.assertEqual(other_days_total, Decimal('0'))

    def test_days_param_clamped(self):
        res = self.client.get(TREND, {'days': 999})
        self.assertEqual(len(res.data), 90)  # clamped to max


class SalesByCategoryAndTopProductsTests(ReportsTestBase):
    def test_sales_by_category(self):
        self.make_sale(qty='3', unit_price='100')  # 300 in Insecticide
        res = self.client.get(BY_CATEGORY)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data[0]['category'], 'Insecticide')
        self.assertEqual(Decimal(res.data[0]['total']), Decimal('300'))

    def test_top_products_ordering(self):
        other = Product.objects.create(name='Zorawar', sku='ZOR-1', category=self.category, brand=self.brand, selling_price=Decimal('50'))
        other_batch = Batch.objects.create(product=other, batch_no='OB1', quantity=Decimal('50'))
        create_sale(customer=None, sale_date=date.today(), payment_method='CASH', discount_amount=Decimal('0'), notes='', user=self.owner,
                    lines=[{'product': other, 'batch': other_batch, 'quantity': Decimal('1'), 'unit_price': Decimal('50')}])
        self.make_sale(qty='5', unit_price='100')  # revenue 500, higher than 50
        res = self.client.get(TOP_PRODUCTS, {'limit': 1})
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['sku'], 'COR-1')

    def test_salesman_forbidden_from_analytics(self):
        self.client.force_authenticate(make_user(UserRole.SALESMAN))
        self.assertEqual(self.client.get(BY_CATEGORY).status_code, 403)
        self.assertEqual(self.client.get(TOP_PRODUCTS).status_code, 403)

    def test_accountant_allowed(self):
        self.client.force_authenticate(make_user(UserRole.ACCOUNTANT))
        self.assertEqual(self.client.get(BY_CATEGORY).status_code, 200)
        self.assertEqual(self.client.get(TOP_PRODUCTS).status_code, 200)
