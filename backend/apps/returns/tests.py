from decimal import Decimal

from rest_framework.test import APITestCase

from apps.accounts.models import User, UserRole
from apps.catalog.models import Batch, Brand, Category, Product
from apps.customers.models import Customer
from apps.inventory.models import StockMovement
from apps.khata.models import KhataPayment

RETURNS = '/api/returns/'
SALES = '/api/sales/'


def make_user(role, email=None):
    return User.objects.create_user(email=email or f'{role.lower()}@x.com', password='S3cure-pass!', name=role.title(), role=role)


class ReturnTestBase(APITestCase):
    def setUp(self):
        self.salesman = make_user(UserRole.SALESMAN)
        self.client.force_authenticate(self.salesman)
        self.product = Product.objects.create(
            name='Coragen', sku='COR-1', category=Category.objects.get(name='Insecticide'),
            brand=Brand.objects.get(name='Syngenta Ag'), selling_price=Decimal('100'),
        )
        self.batch = Batch.objects.create(product=self.product, batch_no='B1', quantity=Decimal('20'))
        self.customer = Customer.objects.create(name='Chaudhry Riaz', credit_limit=Decimal('50000'))

    def make_sale(self, **overrides):
        data = {
            'sale_date': '2025-06-01',
            'payment_method': 'CASH',
            'lines': [{'product': self.product.pk, 'batch': self.batch.pk, 'quantity': '5', 'unit_price': '100'}],
        }
        data.update(overrides)
        res = self.client.post(SALES, data, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        return res.data


class ReturnCreateTests(ReturnTestBase):
    def test_cash_return_restocks_batch_and_logs_movement(self):
        sale = self.make_sale()
        sale_item_id = sale['items'][0]['id']
        self.assertEqual(Batch.objects.get(pk=self.batch.pk).quantity, Decimal('15'))

        res = self.client.post(RETURNS, {
            'sale': sale['id'], 'return_date': '2025-06-02', 'reason': 'Wrong item',
            'refund_method': 'CASH', 'lines': [{'sale_item': sale_item_id, 'quantity': '2'}],
        }, format='json')

        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(Decimal(res.data['total_amount']), Decimal('200'))
        self.assertEqual(Batch.objects.get(pk=self.batch.pk).quantity, Decimal('17'))
        movement = StockMovement.objects.get(batch=self.batch, movement_type='RETURN_IN')
        self.assertEqual(movement.reference, res.data['return_no'])
        self.assertEqual(KhataPayment.objects.count(), 0)

    def test_khata_credit_return_reduces_customer_balance(self):
        sale = self.make_sale(customer=self.customer.pk, payment_method='KHATA')
        sale_item_id = sale['items'][0]['id']

        res = self.client.post(RETURNS, {
            'sale': sale['id'], 'return_date': '2025-06-02', 'reason': 'Damaged',
            'refund_method': 'KHATA_CREDIT', 'lines': [{'sale_item': sale_item_id, 'quantity': '5'}],
        }, format='json')

        self.assertEqual(res.status_code, 201, res.data)
        payment = KhataPayment.objects.get(customer=self.customer)
        self.assertEqual(payment.amount, Decimal('500'))
        self.assertEqual(payment.method, 'ADJUSTMENT')

    def test_khata_credit_without_customer_rejected(self):
        sale = self.make_sale()
        sale_item_id = sale['items'][0]['id']
        res = self.client.post(RETURNS, {
            'sale': sale['id'], 'return_date': '2025-06-02', 'refund_method': 'KHATA_CREDIT',
            'lines': [{'sale_item': sale_item_id, 'quantity': '1'}],
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_cannot_return_more_than_was_sold(self):
        sale = self.make_sale()
        sale_item_id = sale['items'][0]['id']
        res = self.client.post(RETURNS, {
            'sale': sale['id'], 'return_date': '2025-06-02', 'refund_method': 'CASH',
            'lines': [{'sale_item': sale_item_id, 'quantity': '999'}],
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(Batch.objects.get(pk=self.batch.pk).quantity, Decimal('15'))  # untouched

    def test_returning_twice_is_capped_at_remaining_quantity(self):
        sale = self.make_sale()
        sale_item_id = sale['items'][0]['id']
        first = self.client.post(RETURNS, {
            'sale': sale['id'], 'return_date': '2025-06-02', 'refund_method': 'CASH',
            'lines': [{'sale_item': sale_item_id, 'quantity': '3'}],
        }, format='json')
        self.assertEqual(first.status_code, 201, first.data)

        second = self.client.post(RETURNS, {
            'sale': sale['id'], 'return_date': '2025-06-03', 'refund_method': 'CASH',
            'lines': [{'sale_item': sale_item_id, 'quantity': '3'}],
        }, format='json')
        self.assertEqual(second.status_code, 400)  # only 2 left returnable (5 sold - 3 already returned)

    def test_cannot_return_from_a_cancelled_sale(self):
        sale = self.make_sale()
        sale_item_id = sale['items'][0]['id']
        self.client.force_authenticate(make_user(UserRole.OWNER, email='owner@x.com'))
        cancel = self.client.post(f'{SALES}{sale["id"]}/cancel/')
        self.assertEqual(cancel.status_code, 200, cancel.data)

        res = self.client.post(RETURNS, {
            'sale': sale['id'], 'return_date': '2025-06-02', 'refund_method': 'CASH',
            'lines': [{'sale_item': sale_item_id, 'quantity': '1'}],
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_return_cannot_be_deleted(self):
        sale = self.make_sale()
        sale_item_id = sale['items'][0]['id']
        res = self.client.post(RETURNS, {
            'sale': sale['id'], 'return_date': '2025-06-02', 'refund_method': 'CASH',
            'lines': [{'sale_item': sale_item_id, 'quantity': '1'}],
        }, format='json')
        delete = self.client.delete(f'{RETURNS}{res.data["id"]}/')
        self.assertEqual(delete.status_code, 400)


class ReturnPermissionTests(ReturnTestBase):
    def test_accountant_cannot_create_a_return(self):
        sale = self.make_sale()
        sale_item_id = sale['items'][0]['id']
        self.client.force_authenticate(make_user(UserRole.ACCOUNTANT))
        res = self.client.post(RETURNS, {
            'sale': sale['id'], 'return_date': '2025-06-02', 'refund_method': 'CASH',
            'lines': [{'sale_item': sale_item_id, 'quantity': '1'}],
        }, format='json')
        self.assertEqual(res.status_code, 403)

    def test_any_signed_in_role_can_list_returns(self):
        sale = self.make_sale()
        sale_item_id = sale['items'][0]['id']
        self.client.post(RETURNS, {
            'sale': sale['id'], 'return_date': '2025-06-02', 'refund_method': 'CASH',
            'lines': [{'sale_item': sale_item_id, 'quantity': '1'}],
        }, format='json')
        self.client.force_authenticate(make_user(UserRole.ACCOUNTANT, email='acct@x.com'))
        res = self.client.get(RETURNS)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['count'], 1)
