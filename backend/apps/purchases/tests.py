from decimal import Decimal

from rest_framework.test import APITestCase

from apps.accounts.models import User, UserRole
from apps.catalog.models import Batch, Brand, Category, Product
from apps.inventory.models import StockMovement
from apps.suppliers.models import Supplier

from .models import Purchase

PURCHASES = '/api/purchases/'


def make_user(role, email=None):
    return User.objects.create_user(email=email or f'{role.lower()}@x.com', password='S3cure-pass!', name=role.title(), role=role)


class PurchaseTestBase(APITestCase):
    def setUp(self):
        self.owner = make_user(UserRole.OWNER)
        self.client.force_authenticate(self.owner)
        self.supplier = Supplier.objects.create(name='Agri-Tech Ltd')
        self.product = Product.objects.create(
            name='Coragen', sku='COR-1', category=Category.objects.get(name='Insecticide'),
            brand=Brand.objects.get(name='Syngenta Ag'),
        )

    def payload(self, **overrides):
        data = {
            'supplier': self.supplier.pk,
            'purchase_date': '2025-06-01',
            'invoice_no': 'INV-1',
            'items_input': [
                {'product': self.product.pk, 'batch_no': 'B1', 'quantity': '20', 'unit_cost': '100', 'expiry_date': '2027-01-01'},
            ],
        }
        data.update(overrides)
        return data


class PurchaseCreateTests(PurchaseTestBase):
    def test_create_increases_stock_and_logs_movement(self):
        res = self.client.post(PURCHASES, self.payload(), format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(Decimal(res.data['total_amount']), Decimal('2000'))
        self.assertEqual(Decimal(res.data['balance']), Decimal('2000'))

        batch = Batch.objects.get(product=self.product, batch_no='B1')
        self.assertEqual(batch.quantity, Decimal('20'))
        movement = StockMovement.objects.get(batch=batch)
        self.assertEqual(movement.movement_type, 'PURCHASE_IN')
        self.assertEqual(movement.reference, f'PUR-{res.data["id"]}')

    def test_second_purchase_of_same_batch_adds_to_existing_stock(self):
        self.client.post(PURCHASES, self.payload(), format='json')
        self.client.post(PURCHASES, self.payload(items_input=[
            {'product': self.product.pk, 'batch_no': 'B1', 'quantity': '5', 'unit_cost': '105', 'expiry_date': '2027-01-01'},
        ]), format='json')
        batch = Batch.objects.get(product=self.product, batch_no='B1')
        self.assertEqual(batch.quantity, Decimal('25'))

    def test_conflicting_expiry_for_same_batch_no_rejected(self):
        self.client.post(PURCHASES, self.payload(), format='json')
        res = self.client.post(PURCHASES, self.payload(items_input=[
            {'product': self.product.pk, 'batch_no': 'B1', 'quantity': '5', 'unit_cost': '100', 'expiry_date': '2099-01-01'},
        ]), format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(Batch.objects.get(product=self.product, batch_no='B1').quantity, Decimal('20'))  # unchanged

    def test_requires_at_least_one_item(self):
        res = self.client.post(PURCHASES, self.payload(items_input=[]), format='json')
        self.assertEqual(res.status_code, 400)

    def test_invalid_line_rejected_and_nothing_partially_applied(self):
        res = self.client.post(PURCHASES, self.payload(items_input=[
            {'product': self.product.pk, 'batch_no': 'B1', 'quantity': '-1', 'unit_cost': '100'},
        ]), format='json')
        self.assertEqual(res.status_code, 400)
        self.assertFalse(Batch.objects.filter(product=self.product).exists())

    def test_edit_cannot_change_items_or_status(self):
        res = self.client.post(PURCHASES, self.payload(), format='json')
        pid = res.data['id']
        patch = self.client.patch(f'{PURCHASES}{pid}/', {'notes': 'updated', 'status': 'CANCELLED'}, format='json')
        self.assertEqual(patch.status_code, 200)
        self.assertEqual(patch.data['notes'], 'updated')
        self.assertEqual(patch.data['status'], 'RECEIVED')  # status change ignored, must use /cancel/


class PurchasePaymentTests(PurchaseTestBase):
    def setUp(self):
        super().setUp()
        self.purchase_id = self.client.post(PURCHASES, self.payload(), format='json').data['id']

    def test_partial_then_full_payment(self):
        res = self.client.post(f'{PURCHASES}{self.purchase_id}/pay/', {'amount': '800', 'method': 'CASH', 'paid_on': '2025-06-05'}, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(Decimal(res.data['balance']), Decimal('1200'))
        res = self.client.post(f'{PURCHASES}{self.purchase_id}/pay/', {'amount': '1200', 'method': 'BANK_TRANSFER', 'paid_on': '2025-06-10'}, format='json')
        self.assertEqual(Decimal(res.data['balance']), Decimal('0'))

    def test_overpayment_rejected(self):
        res = self.client.post(f'{PURCHASES}{self.purchase_id}/pay/', {'amount': '5000', 'paid_on': '2025-06-05'}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_cannot_pay_cancelled_purchase(self):
        # No payments yet, so cancel is allowed.
        self.client.post(f'{PURCHASES}{self.purchase_id}/cancel/')
        res = self.client.post(f'{PURCHASES}{self.purchase_id}/pay/', {'amount': '100', 'paid_on': '2025-06-05'}, format='json')
        self.assertEqual(res.status_code, 400)


class PurchaseCancelTests(PurchaseTestBase):
    def test_cancel_reverses_stock(self):
        pid = self.client.post(PURCHASES, self.payload(), format='json').data['id']
        res = self.client.post(f'{PURCHASES}{pid}/cancel/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Batch.objects.get(product=self.product, batch_no='B1').quantity, Decimal('0'))
        self.assertEqual(res.data['status'], 'CANCELLED')

    def test_cannot_cancel_twice(self):
        pid = self.client.post(PURCHASES, self.payload(), format='json').data['id']
        self.client.post(f'{PURCHASES}{pid}/cancel/')
        self.assertEqual(self.client.post(f'{PURCHASES}{pid}/cancel/').status_code, 400)

    def test_cannot_cancel_if_stock_already_moved(self):
        pid = self.client.post(PURCHASES, self.payload(), format='json').data['id']
        batch = Batch.objects.get(product=self.product, batch_no='B1')
        from apps.inventory.models import MovementType
        from apps.inventory.services import apply_stock_movement
        apply_stock_movement(batch=batch, movement_type=MovementType.SALE_OUT, quantity=Decimal('15'), user=self.owner)
        res = self.client.post(f'{PURCHASES}{pid}/cancel/')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(Batch.objects.get(pk=batch.pk).quantity, Decimal('5'))  # untouched by the failed cancel

    def test_cannot_cancel_with_payments(self):
        pid = self.client.post(PURCHASES, self.payload(), format='json').data['id']
        self.client.post(f'{PURCHASES}{pid}/pay/', {'amount': '100', 'paid_on': '2025-06-05'}, format='json')
        self.assertEqual(self.client.post(f'{PURCHASES}{pid}/cancel/').status_code, 400)

    def test_delete_is_disabled(self):
        pid = self.client.post(PURCHASES, self.payload(), format='json').data['id']
        self.assertEqual(self.client.delete(f'{PURCHASES}{pid}/').status_code, 400)


class PurchasePermissionAndFilterTests(PurchaseTestBase):
    def test_salesman_forbidden(self):
        self.client.force_authenticate(make_user(UserRole.SALESMAN))
        self.assertEqual(self.client.get(PURCHASES).status_code, 403)

    def test_manager_and_accountant_allowed(self):
        for role in (UserRole.MANAGER, UserRole.ACCOUNTANT):
            self.client.force_authenticate(make_user(role))
            self.assertEqual(self.client.get(PURCHASES).status_code, 200)

    def test_filter_by_supplier_and_status(self):
        self.client.post(PURCHASES, self.payload(), format='json')
        other = Supplier.objects.create(name='Other Supplier')
        self.client.post(PURCHASES, self.payload(supplier=other.pk, invoice_no='INV-2'), format='json')
        self.assertEqual(self.client.get(PURCHASES, {'supplier': self.supplier.pk}).data['count'], 1)
        self.assertEqual(self.client.get(PURCHASES, {'status': 'RECEIVED'}).data['count'], 2)
        self.assertEqual(self.client.get(PURCHASES, {'search': 'INV-2'}).data['count'], 1)
