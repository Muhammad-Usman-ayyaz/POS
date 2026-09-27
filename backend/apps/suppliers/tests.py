from decimal import Decimal

from rest_framework.test import APITestCase

from apps.accounts.models import User, UserRole
from apps.catalog.models import Brand, Category, Product

from .models import Supplier

SUPPLIERS = '/api/suppliers/'


def make_user(role, email=None):
    return User.objects.create_user(email=email or f'{role.lower()}@x.com', password='S3cure-pass!', name=role.title(), role=role)


class SupplierTestBase(APITestCase):
    def setUp(self):
        self.owner = make_user(UserRole.OWNER)
        self.client.force_authenticate(self.owner)
        self.product = Product.objects.create(
            name='Coragen', sku='COR-1', category=Category.objects.get(name='Insecticide'),
            brand=Brand.objects.get(name='Syngenta Ag'),
        )


class SupplierApiTests(SupplierTestBase):
    def test_create_and_duplicate_name_rejected(self):
        res = self.client.post(SUPPLIERS, {'name': 'Agri-Tech Ltd', 'phone': '0300-1234567'}, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(Decimal(res.data['outstanding_balance']), Decimal('0'))
        dup = self.client.post(SUPPLIERS, {'name': 'agri-tech ltd'}, format='json')
        self.assertEqual(dup.status_code, 400)

    def test_outstanding_balance_reflects_purchases_and_payments(self):
        supplier = Supplier.objects.create(name='Direct Import')
        from apps.purchases.models import Purchase, PurchaseItem, SupplierPayment
        purchase = Purchase.objects.create(supplier=supplier, purchase_date='2025-01-01')
        PurchaseItem.objects.create(purchase=purchase, product=self.product, batch_no='B1', quantity=Decimal('10'), unit_cost=Decimal('100'))
        data = self.client.get(f'{SUPPLIERS}{supplier.pk}/').data
        self.assertEqual(Decimal(data['total_purchased']), Decimal('1000'))
        self.assertEqual(Decimal(data['outstanding_balance']), Decimal('1000'))

        SupplierPayment.objects.create(purchase=purchase, amount=Decimal('400'), paid_on='2025-01-05')
        data = self.client.get(f'{SUPPLIERS}{supplier.pk}/').data
        self.assertEqual(Decimal(data['outstanding_balance']), Decimal('600'))

    def test_cancelled_purchase_excluded_from_balance(self):
        supplier = Supplier.objects.create(name='Regional Supply')
        from apps.purchases.models import Purchase, PurchaseItem
        purchase = Purchase.objects.create(supplier=supplier, purchase_date='2025-01-01', status=Purchase.Status.CANCELLED)
        PurchaseItem.objects.create(purchase=purchase, product=self.product, batch_no='B1', quantity=Decimal('10'), unit_cost=Decimal('100'))
        data = self.client.get(f'{SUPPLIERS}{supplier.pk}/').data
        self.assertEqual(Decimal(data['outstanding_balance']), Decimal('0'))
        self.assertEqual(data['purchase_count'], 0)

    def test_delete_blocked_when_purchase_history_exists(self):
        supplier = Supplier.objects.create(name='With History')
        from apps.purchases.models import Purchase
        Purchase.objects.create(supplier=supplier, purchase_date='2025-01-01')
        self.assertEqual(self.client.delete(f'{SUPPLIERS}{supplier.pk}/').status_code, 400)

    def test_delete_allowed_without_history_and_is_soft(self):
        supplier = Supplier.objects.create(name='No History')
        self.assertEqual(self.client.delete(f'{SUPPLIERS}{supplier.pk}/').status_code, 204)
        self.assertTrue(Supplier.all_objects.get(pk=supplier.pk).is_deleted)

    def test_search(self):
        Supplier.objects.create(name='Kanzo Distributors', phone='0301-0000000')
        Supplier.objects.create(name='Other Co')
        self.assertEqual(len(self.client.get(SUPPLIERS, {'search': 'kanzo'}).data), 1)

    def test_salesman_forbidden(self):
        self.client.force_authenticate(make_user(UserRole.SALESMAN))
        self.assertEqual(self.client.get(SUPPLIERS).status_code, 403)
