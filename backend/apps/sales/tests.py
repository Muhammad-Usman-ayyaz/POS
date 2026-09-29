from decimal import Decimal

from rest_framework.test import APITestCase

from apps.accounts.models import User, UserRole
from apps.catalog.models import Batch, Brand, Category, Product
from apps.customers.models import Customer
from apps.inventory.models import StockMovement
from apps.khata.models import KhataCharge

SALES = '/api/sales/'


def make_user(role, email=None):
    return User.objects.create_user(email=email or f'{role.lower()}@x.com', password='S3cure-pass!', name=role.title(), role=role)


class SaleTestBase(APITestCase):
    def setUp(self):
        self.salesman = make_user(UserRole.SALESMAN)
        self.client.force_authenticate(self.salesman)
        self.product = Product.objects.create(
            name='Coragen', sku='COR-1', category=Category.objects.get(name='Insecticide'),
            brand=Brand.objects.get(name='Syngenta Ag'), selling_price=Decimal('100'),
        )
        self.batch = Batch.objects.create(product=self.product, batch_no='B1', quantity=Decimal('20'))
        self.customer = Customer.objects.create(name='Chaudhry Riaz', credit_limit=Decimal('50000'))

    def payload(self, **overrides):
        data = {
            'sale_date': '2025-06-01',
            'payment_method': 'CASH',
            'lines': [{'product': self.product.pk, 'batch': self.batch.pk, 'quantity': '5', 'unit_price': '100'}],
        }
        data.update(overrides)
        return data


class SaleCreateTests(SaleTestBase):
    def test_cash_sale_decreases_stock_and_logs_movement(self):
        res = self.client.post(SALES, self.payload(), format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(Decimal(res.data['total_amount']), Decimal('500'))
        self.assertEqual(Batch.objects.get(pk=self.batch.pk).quantity, Decimal('15'))
        movement = StockMovement.objects.get(batch=self.batch)
        self.assertEqual(movement.movement_type, 'SALE_OUT')
        self.assertEqual(movement.reference, f'INV-{res.data["id"]}')

    def test_insufficient_stock_rejected_and_nothing_applied(self):
        res = self.client.post(SALES, self.payload(lines=[
            {'product': self.product.pk, 'batch': self.batch.pk, 'quantity': '999', 'unit_price': '100'}
        ]), format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(Batch.objects.get(pk=self.batch.pk).quantity, Decimal('20'))  # untouched

    def test_khata_sale_requires_customer(self):
        res = self.client.post(SALES, self.payload(payment_method='KHATA'), format='json')
        self.assertEqual(res.status_code, 400)

    def test_khata_sale_posts_charge_to_customer_ledger(self):
        res = self.client.post(SALES, self.payload(payment_method='KHATA', customer=self.customer.pk), format='json')
        self.assertEqual(res.status_code, 201, res.data)
        charge = KhataCharge.objects.get(customer=self.customer)
        self.assertEqual(charge.amount, Decimal('500'))
        self.assertIn(res.data['invoice_no'], charge.description)

    def test_discount_reduces_total(self):
        res = self.client.post(SALES, self.payload(discount_amount='50'), format='json')
        self.assertEqual(Decimal(res.data['total_amount']), Decimal('450'))

    def test_discount_exceeding_subtotal_rejected(self):
        res = self.client.post(SALES, self.payload(discount_amount='9999'), format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(Batch.objects.get(pk=self.batch.pk).quantity, Decimal('20'))  # nothing applied

    def test_batch_must_belong_to_product(self):
        other_product = Product.objects.create(
            name='Other', sku='OTH-1', category=Category.objects.get(name='Insecticide'),
            brand=Brand.objects.get(name='Syngenta Ag'),
        )
        res = self.client.post(SALES, self.payload(lines=[
            {'product': other_product.pk, 'batch': self.batch.pk, 'quantity': '1', 'unit_price': '100'}
        ]), format='json')
        self.assertEqual(res.status_code, 400)

    def test_requires_at_least_one_line(self):
        res = self.client.post(SALES, self.payload(lines=[]), format='json')
        self.assertEqual(res.status_code, 400)

    def test_full_cash_sale_has_zero_balance_and_no_khata_charge(self):
        res = self.client.post(SALES, self.payload(customer=self.customer.pk), format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(Decimal(res.data['paid_amount']), Decimal('500'))
        self.assertEqual(Decimal(res.data['balance']), Decimal('0'))
        self.assertFalse(KhataCharge.objects.filter(customer=self.customer).exists())

    def test_split_payment_charges_remainder_to_khata(self):
        res = self.client.post(SALES, self.payload(customer=self.customer.pk, paid_amount='300'), format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(Decimal(res.data['paid_amount']), Decimal('300'))
        self.assertEqual(Decimal(res.data['balance']), Decimal('200'))
        charge = KhataCharge.objects.get(customer=self.customer)
        self.assertEqual(charge.amount, Decimal('200'))

    def test_split_payment_without_customer_rejected(self):
        res = self.client.post(SALES, self.payload(paid_amount='300'), format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(Batch.objects.get(pk=self.batch.pk).quantity, Decimal('20'))  # nothing applied

    def test_paid_amount_exceeding_total_rejected(self):
        res = self.client.post(SALES, self.payload(customer=self.customer.pk, paid_amount='9999'), format='json')
        self.assertEqual(res.status_code, 400)

    def test_paid_amount_ignored_for_khata_sale(self):
        # payment_method=KHATA always means "pay nothing now", regardless of paid_amount.
        res = self.client.post(SALES, self.payload(payment_method='KHATA', customer=self.customer.pk, paid_amount='999'), format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(Decimal(res.data['paid_amount']), Decimal('0'))
        self.assertEqual(KhataCharge.objects.get(customer=self.customer).amount, Decimal('500'))


class SaleCancelTests(SaleTestBase):
    def test_cancel_reverses_stock(self):
        sid = self.client.post(SALES, self.payload(), format='json').data['id']
        self.client.force_authenticate(make_user(UserRole.MANAGER))
        res = self.client.post(f'{SALES}{sid}/cancel/')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(Batch.objects.get(pk=self.batch.pk).quantity, Decimal('20'))
        self.assertEqual(res.data['status'], 'CANCELLED')

    def test_cancel_removes_khata_charge(self):
        sid = self.client.post(SALES, self.payload(payment_method='KHATA', customer=self.customer.pk), format='json').data['id']
        self.assertEqual(KhataCharge.objects.filter(customer=self.customer).count(), 1)
        self.client.force_authenticate(make_user(UserRole.MANAGER))
        self.client.post(f'{SALES}{sid}/cancel/')
        self.assertEqual(KhataCharge.objects.filter(customer=self.customer).count(), 0)

    def test_cannot_cancel_twice(self):
        sid = self.client.post(SALES, self.payload(), format='json').data['id']
        self.client.force_authenticate(make_user(UserRole.MANAGER))
        self.client.post(f'{SALES}{sid}/cancel/')
        self.assertEqual(self.client.post(f'{SALES}{sid}/cancel/').status_code, 400)

    def test_salesman_cannot_cancel(self):
        sid = self.client.post(SALES, self.payload(), format='json').data['id']
        self.assertEqual(self.client.post(f'{SALES}{sid}/cancel/').status_code, 403)

    def test_delete_is_disabled(self):
        sid = self.client.post(SALES, self.payload(), format='json').data['id']
        self.assertEqual(self.client.delete(f'{SALES}{sid}/').status_code, 400)


class SalePermissionAndInvoiceTests(SaleTestBase):
    def test_accountant_can_read_but_not_sell(self):
        self.client.force_authenticate(make_user(UserRole.ACCOUNTANT))
        self.assertEqual(self.client.get(SALES).status_code, 200)
        self.assertEqual(self.client.post(SALES, self.payload(), format='json').status_code, 403)

    def test_owner_and_manager_can_sell(self):
        for role in (UserRole.OWNER, UserRole.MANAGER):
            self.client.force_authenticate(make_user(role))
            self.assertEqual(self.client.post(SALES, self.payload(), format='json').status_code, 201)

    def test_invoice_pdf_is_downloadable(self):
        sid = self.client.post(SALES, self.payload(), format='json').data['id']
        res = self.client.get(f'{SALES}{sid}/invoice/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'application/pdf')
        self.assertGreater(len(res.content), 500)

    def test_filter_by_search_and_status(self):
        self.client.post(SALES, self.payload(), format='json')
        self.assertEqual(self.client.get(SALES, {'status': 'COMPLETED'}).data['count'], 1)
        self.assertEqual(self.client.get(SALES, {'payment_method': 'KHATA'}).data['count'], 0)
