from decimal import Decimal

from rest_framework.test import APITestCase

from apps.accounts.models import User, UserRole
from apps.catalog.models import Batch, Brand, Category, Product

from .models import MovementType, StockMovement
from .services import apply_stock_movement, get_or_create_batch_for_purchase

BATCHES = '/api/inventory/batches/'
MOVEMENTS = '/api/inventory/movements/'
ADJUST = '/api/inventory/adjustments/'


def make_user(role, email=None):
    return User.objects.create_user(email=email or f'{role.lower()}@x.com', password='S3cure-pass!', name=role.title(), role=role)


class InventoryTestBase(APITestCase):
    def setUp(self):
        self.category = Category.objects.get(name='Insecticide')
        self.brand = Brand.objects.get(name='Syngenta Ag')
        self.product = Product.objects.create(name='Coragen', sku='COR-1', category=self.category, brand=self.brand, min_stock_level=10)
        self.batch = Batch.objects.create(product=self.product, batch_no='B1', quantity=Decimal('50'))
        self.owner = make_user(UserRole.OWNER)
        self.client.force_authenticate(self.owner)


class StockServiceTests(InventoryTestBase):
    def test_inbound_increases_and_logs_balance(self):
        movement = apply_stock_movement(batch=self.batch, movement_type=MovementType.ADJUSTMENT_IN, quantity=Decimal('5'), user=self.owner)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.quantity, Decimal('55'))
        self.assertEqual(movement.balance_after, Decimal('55'))

    def test_outbound_decreases(self):
        apply_stock_movement(batch=self.batch, movement_type=MovementType.DAMAGED, quantity=Decimal('20'), user=self.owner)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.quantity, Decimal('30'))

    def test_outbound_cannot_go_negative(self):
        with self.assertRaises(Exception):
            apply_stock_movement(batch=self.batch, movement_type=MovementType.EXPIRED, quantity=Decimal('999'), user=self.owner)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.quantity, Decimal('50'))

    def test_zero_or_negative_quantity_rejected(self):
        with self.assertRaises(Exception):
            apply_stock_movement(batch=self.batch, movement_type=MovementType.ADJUSTMENT_IN, quantity=Decimal('0'), user=self.owner)

    def test_get_or_create_batch_reuses_same_expiry_but_blocks_conflicting_expiry(self):
        b = get_or_create_batch_for_purchase(product=self.product, batch_no='B1', expiry_date=None)
        self.assertEqual(b.pk, self.batch.pk)
        from datetime import date
        with self.assertRaises(Exception):
            get_or_create_batch_for_purchase(product=self.product, batch_no='B1', expiry_date=date(2030, 1, 1))


class BatchStockApiTests(InventoryTestBase):
    def test_list_and_filters(self):
        Batch.objects.create(product=self.product, batch_no='B2', quantity=Decimal('0'))
        res = self.client.get(BATCHES)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['count'], 2)
        out = self.client.get(BATCHES, {'status': 'out'}).data['results']
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]['batch_no'], 'B2')

    def test_deleted_product_hidden(self):
        self.product.soft_delete()
        self.assertEqual(self.client.get(BATCHES).data['count'], 0)

    def test_read_only_for_every_role_write_blocked(self):
        self.client.force_authenticate(make_user(UserRole.SALESMAN))
        self.assertEqual(self.client.get(BATCHES).status_code, 200)
        self.assertEqual(self.client.post(ADJUST, {}, format='json').status_code, 403)

    def test_salesman_does_not_see_cost_price(self):
        self.product.purchase_price = Decimal('100')
        self.product.save()
        self.client.force_authenticate(make_user(UserRole.SALESMAN))
        self.assertIsNone(self.client.get(BATCHES).data['results'][0]['purchase_price'])


class AdjustmentApiTests(InventoryTestBase):
    def test_adjustment_in_and_out(self):
        res = self.client.post(ADJUST, {'batch': self.batch.pk, 'movement_type': 'ADJUSTMENT_IN', 'quantity': '5', 'note': 'recount'}, format='json')
        self.assertEqual(res.status_code, 201)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.quantity, Decimal('55'))

        res = self.client.post(ADJUST, {'batch': self.batch.pk, 'movement_type': 'DAMAGED', 'quantity': '10'}, format='json')
        self.assertEqual(res.status_code, 201)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.quantity, Decimal('45'))

    def test_over_removal_rejected(self):
        res = self.client.post(ADJUST, {'batch': self.batch.pk, 'movement_type': 'EXPIRED', 'quantity': '999'}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_purchase_movement_types_not_allowed_via_adjustment_endpoint(self):
        res = self.client.post(ADJUST, {'batch': self.batch.pk, 'movement_type': 'PURCHASE_IN', 'quantity': '1'}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_only_back_office_may_adjust(self):
        self.client.force_authenticate(make_user(UserRole.SALESMAN))
        res = self.client.post(ADJUST, {'batch': self.batch.pk, 'movement_type': 'ADJUSTMENT_IN', 'quantity': '1'}, format='json')
        self.assertEqual(res.status_code, 403)


class MovementLedgerApiTests(InventoryTestBase):
    def setUp(self):
        super().setUp()
        apply_stock_movement(batch=self.batch, movement_type=MovementType.DAMAGED, quantity=Decimal('3'), user=self.owner, reference='REF-1')

    def test_list_and_search(self):
        res = self.client.get(MOVEMENTS)
        self.assertEqual(res.data['count'], 1)
        self.assertEqual(self.client.get(MOVEMENTS, {'search': 'REF-1'}).data['count'], 1)
        self.assertEqual(self.client.get(MOVEMENTS, {'movement_type': 'DAMAGED'}).data['count'], 1)
        self.assertEqual(self.client.get(MOVEMENTS, {'movement_type': 'EXPIRED'}).data['count'], 0)

    def test_salesman_and_anonymous_blocked(self):
        self.client.force_authenticate(make_user(UserRole.SALESMAN))
        self.assertEqual(self.client.get(MOVEMENTS).status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(MOVEMENTS).status_code, 401)

    def test_accountant_can_read(self):
        self.client.force_authenticate(make_user(UserRole.ACCOUNTANT))
        self.assertEqual(self.client.get(MOVEMENTS).status_code, 200)
