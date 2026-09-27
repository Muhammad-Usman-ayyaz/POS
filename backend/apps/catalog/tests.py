from datetime import timedelta
from decimal import Decimal

from django.core.management import call_command
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User, UserRole

from .models import Batch, Brand, Category, Product

PRODUCTS = '/api/catalog/products/'


def make_user(role, email=None):
    return User.objects.create_user(email=email or f'{role.lower()}@x.com', password='S3cure-pass!', name=role.title(), role=role)


class CatalogTestBase(APITestCase):
    def setUp(self):
        self.category = Category.objects.get(name='Insecticide')
        self.brand = Brand.objects.get(name='Syngenta Ag')
        self.owner = make_user(UserRole.OWNER)
        self.client.force_authenticate(self.owner)

    def payload(self, **overrides):
        data = {
            'name': 'Coragen 20 SC', 'sku': 'sku-1', 'category': self.category.pk, 'brand': self.brand.pk,
            'purchase_price': '1000.00', 'selling_price': '1250.00', 'packaging': '50ml',
        }
        data.update(overrides)
        return data

    def create(self, **overrides):
        res = self.client.post(PRODUCTS, self.payload(**overrides), format='json')
        self.assertEqual(res.status_code, 201, res.data)
        return res.data


class ProductApiTests(CatalogTestBase):
    def test_reference_data_is_seeded(self):
        self.assertGreaterEqual(Category.objects.count(), 5)
        self.assertTrue(Brand.objects.filter(name='Bayer CropScience').exists())

    def test_create_with_opening_stock_computes_fields(self):
        data = self.create(opening_quantity='30', opening_batch_no='B-1', opening_expiry_date='2027-05-01')
        self.assertEqual(data['sku'], 'SKU-1')  # normalised
        self.assertEqual(Decimal(data['current_stock']), Decimal('30'))
        self.assertEqual(data['stock_status'], 'Healthy')
        self.assertEqual(data['margin_pct'], 25.0)
        self.assertEqual(data['batch_no'], 'B-1')
        self.assertEqual(data['expiry_date'], '2027-05-01')
        self.assertEqual(data['category_name'], 'Insecticide')

    def test_no_opening_stock_means_out_of_stock(self):
        data = self.create()
        self.assertEqual(data['stock_status'], 'Out of Stock')
        self.assertEqual(data['status'], 'Restock Pending')
        self.assertEqual(Batch.objects.count(), 0)

    def test_stock_status_uses_min_level(self):
        low = self.create(sku='LOW', opening_quantity='20')  # default min level 20 -> low
        ok = self.create(sku='OK', opening_quantity='21')
        self.assertEqual(low['stock_status'], 'Low Stock')
        self.assertEqual(ok['stock_status'], 'Healthy')

    def test_duplicate_sku_rejected_but_reusable_after_delete(self):
        first = self.create()
        dup = self.client.post(PRODUCTS, self.payload(sku='SKU-1'), format='json')
        self.assertEqual(dup.status_code, 400)
        self.assertIn('sku', dup.data)
        self.assertEqual(self.client.delete(f'{PRODUCTS}{first["id"]}/').status_code, 204)
        self.create()  # same SKU is free again

    def test_validation_errors(self):
        self.assertEqual(self.client.post(PRODUCTS, self.payload(selling_price='-5'), format='json').status_code, 400)
        self.assertEqual(self.client.post(PRODUCTS, self.payload(name=''), format='json').status_code, 400)
        self.assertEqual(self.client.post(PRODUCTS, self.payload(category=9999), format='json').status_code, 400)
        self.assertEqual(self.client.post(PRODUCTS, self.payload(opening_quantity='-1'), format='json').status_code, 400)

    def test_update_changes_fields_but_not_stock_and_rejects_opening_fields(self):
        data = self.create(opening_quantity='10')
        res = self.client.patch(f'{PRODUCTS}{data["id"]}/', {'selling_price': '1500.00', 'name': 'Renamed'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['name'], 'Renamed')
        self.assertEqual(Decimal(res.data['current_stock']), Decimal('10'))
        bad = self.client.patch(f'{PRODUCTS}{data["id"]}/', {'opening_quantity': '999'}, format='json')
        self.assertEqual(bad.status_code, 400)

    def test_soft_delete_hides_but_keeps_row(self):
        data = self.create()
        self.assertEqual(self.client.delete(f'{PRODUCTS}{data["id"]}/').status_code, 204)
        self.assertEqual(self.client.get(f'{PRODUCTS}{data["id"]}/').status_code, 404)
        self.assertEqual(self.client.get(PRODUCTS).data['count'], 0)
        row = Product.all_objects.get(pk=data['id'])
        self.assertTrue(row.is_deleted)
        self.assertEqual(row.deleted_by, self.owner)
        self.assertIsNotNone(row.deleted_at)

    def test_model_delete_and_queryset_delete_are_soft(self):
        p = Product.objects.create(name='A', sku='A', category=self.category, brand=self.brand)
        p.delete()
        self.assertTrue(Product.all_objects.get(pk=p.pk).is_deleted)
        q = Product.objects.create(name='B', sku='B', category=self.category, brand=self.brand)
        Product.objects.filter(pk=q.pk).delete()
        self.assertTrue(Product.all_objects.get(pk=q.pk).is_deleted)

    def test_db_constraints(self):
        Product.objects.create(name='A', sku='DUP', category=self.category, brand=self.brand)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Product.objects.create(name='B', sku='DUP', category=self.category, brand=self.brand)
        p = Product.objects.get(sku='DUP')
        with self.assertRaises(IntegrityError), transaction.atomic():
            Batch.objects.create(product=p, batch_no='X', quantity=Decimal('-1'))


class ProductListTests(CatalogTestBase):
    def setUp(self):
        super().setUp()
        call_command('seed_demo_catalog', verbosity=0)

    def test_search_filter_and_pagination(self):
        self.assertEqual(self.client.get(PRODUCTS).data['count'], 10)
        self.assertEqual(self.client.get(PRODUCTS, {'search': 'chlorantranil'}).data['count'], 1)
        self.assertEqual(self.client.get(PRODUCTS, {'search': 'bayer'}).data['count'], 2)
        fung = Category.objects.get(name='Fungicide').pk
        self.assertEqual(self.client.get(PRODUCTS, {'category': fung}).data['count'], 3)
        page = self.client.get(PRODUCTS, {'page_size': 4, 'page': 3}).data
        self.assertEqual(len(page['results']), 2)
        self.assertEqual(page['count'], 10)
        self.assertEqual(self.client.get(PRODUCTS, {'page_size': 1000}).data['results'].__len__(), 10)  # capped at 100

    def test_stock_status_filter(self):
        self.assertEqual(self.client.get(PRODUCTS, {'stock_status': 'out'}).data['count'], 1)   # Karate
        self.assertEqual(self.client.get(PRODUCTS, {'stock_status': 'low'}).data['count'], 1)   # Amistar (8)
        self.assertEqual(self.client.get(PRODUCTS, {'stock_status': 'healthy'}).data['count'], 8)

    def test_ordering_whitelist(self):
        res = self.client.get(PRODUCTS, {'ordering': '-selling_price'}).data['results']
        prices = [Decimal(p['selling_price']) for p in res]
        self.assertEqual(prices, sorted(prices, reverse=True))
        # unknown ordering must not error or leak
        self.assertEqual(self.client.get(PRODUCTS, {'ordering': 'password'}).status_code, 200)

    def test_summary(self):
        s = self.client.get(f'{PRODUCTS}summary/').data
        self.assertEqual(s['total_products'], 10)
        self.assertEqual(s['low_stock_count'], 1)
        self.assertEqual(s['out_of_stock_count'], 1)
        expected = sum(Decimal(str(c)) * q for c, q in [
            (1450, 145), (2900, 52), (2150, 8), (10850, 320), (950, 64), (1600, 92), (1780, 38), (3650, 450), (1820, 0), (3100, 24)])
        self.assertEqual(Decimal(s['stock_value']), expected)
        self.assertIsNotNone(s['weighted_margin_pct'])

    def test_expiry_counts(self):
        today = timezone.localdate()
        p = Product.objects.get(sku='SKU-AA-4482')
        p.batches.update(expiry_date=today + timedelta(days=30))
        s = self.client.get(f'{PRODUCTS}summary/').data
        self.assertGreaterEqual(s['expiring_soon_count'], 1)

    def test_csv_export_respects_filters_and_escapes_formulas(self):
        Product.objects.filter(sku='SKU-AA-4482').update(name='=HYPERLINK("x")')
        res = self.client.get(f'{PRODUCTS}export/', {'search': 'Sitara'})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'].split(';')[0], 'text/csv')
        body = res.content.decode()
        self.assertEqual(len(body.strip().splitlines()), 1)  # header only: renamed product no longer matches 'Sitara'
        res = self.client.get(f'{PRODUCTS}export/', {'search': 'SKU-AA-4482'})
        self.assertIn("'=HYPERLINK", res.content.decode())
        self.assertIn('Purchase Price', res.content.decode())


class CatalogPermissionTests(CatalogTestBase):
    def setUp(self):
        super().setUp()
        call_command('seed_demo_catalog', verbosity=0)
        self.client.force_authenticate(None)

    def test_anonymous_blocked(self):
        self.assertEqual(self.client.get(PRODUCTS).status_code, 401)

    def test_salesman_reads_without_cost_but_cannot_write(self):
        self.client.force_authenticate(make_user(UserRole.SALESMAN))
        res = self.client.get(PRODUCTS)
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(res.data['results'][0]['purchase_price'])
        self.assertIsNone(res.data['results'][0]['margin_pct'])
        summary = self.client.get(f'{PRODUCTS}summary/').data
        self.assertIsNone(summary['stock_value'])
        self.assertNotIn('Purchase Price', self.client.get(f'{PRODUCTS}export/').content.decode())
        self.assertEqual(self.client.post(PRODUCTS, self.payload(), format='json').status_code, 403)
        pk = Product.objects.first().pk
        self.assertEqual(self.client.patch(f'{PRODUCTS}{pk}/', {'name': 'x'}, format='json').status_code, 403)
        self.assertEqual(self.client.delete(f'{PRODUCTS}{pk}/').status_code, 403)

    def test_accountant_reads_with_cost_but_cannot_write(self):
        self.client.force_authenticate(make_user(UserRole.ACCOUNTANT))
        res = self.client.get(PRODUCTS)
        self.assertIsNotNone(res.data['results'][0]['purchase_price'])
        self.assertEqual(self.client.post(PRODUCTS, self.payload(), format='json').status_code, 403)

    def test_manager_can_write(self):
        self.client.force_authenticate(make_user(UserRole.MANAGER))
        self.assertEqual(self.client.post(PRODUCTS, self.payload(), format='json').status_code, 201)


class ReferenceDataTests(CatalogTestBase):
    def test_category_crud_and_delete_blocked_while_in_use(self):
        res = self.client.post('/api/catalog/categories/', {'name': 'Seeds'}, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(self.client.post('/api/catalog/categories/', {'name': 'seeds'}, format='json').status_code, 400)
        self.create()
        self.assertEqual(self.client.delete(f'/api/catalog/categories/{self.category.pk}/').status_code, 400)
        self.assertEqual(self.client.delete(f'/api/catalog/categories/{res.data["id"]}/').status_code, 204)
        names = [c['name'] for c in self.client.get('/api/catalog/categories/').data]
        self.assertNotIn('Seeds', names)

    def test_salesman_cannot_manage_brands(self):
        self.client.force_authenticate(make_user(UserRole.SALESMAN))
        self.assertEqual(self.client.get('/api/catalog/brands/').status_code, 200)
        self.assertEqual(self.client.post('/api/catalog/brands/', {'name': 'New'}, format='json').status_code, 403)
