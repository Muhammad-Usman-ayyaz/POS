from decimal import Decimal

from rest_framework.test import APITestCase

from apps.accounts.models import User, UserRole
from apps.customers.models import Customer

from .models import KhataCharge, KhataPayment

LEDGER = '/api/khata/ledger/'


def make_user(role, email=None):
    return User.objects.create_user(email=email or f'{role.lower()}@x.com', password='S3cure-pass!', name=role.title(), role=role)


class KhataLedgerTests(APITestCase):
    def setUp(self):
        self.client.force_authenticate(make_user(UserRole.OWNER))
        self.farmer_a = Customer.objects.create(name='Farmer A')
        self.farmer_b = Customer.objects.create(name='Farmer B')
        KhataCharge.objects.create(customer=self.farmer_a, amount=Decimal('1000'), charge_date='2025-01-01')
        KhataPayment.objects.create(customer=self.farmer_a, amount=Decimal('400'), paid_on='2025-01-05')
        KhataCharge.objects.create(customer=self.farmer_b, amount=Decimal('2000'), charge_date='2025-01-02')

    def test_combined_ledger_ordered_newest_first(self):
        res = self.client.get(LEDGER).data
        self.assertEqual(res['count'], 3)
        dates = [row['date'] for row in res['results']]
        self.assertEqual(dates, sorted(dates, reverse=True))

    def test_filter_by_customer(self):
        res = self.client.get(LEDGER, {'customer': self.farmer_a.pk}).data
        self.assertEqual(res['count'], 2)

    def test_filter_by_type(self):
        self.assertEqual(self.client.get(LEDGER, {'type': 'CHARGE'}).data['count'], 2)
        self.assertEqual(self.client.get(LEDGER, {'type': 'PAYMENT'}).data['count'], 1)

    def test_search_by_customer_name(self):
        self.assertEqual(self.client.get(LEDGER, {'search': 'farmer b'}).data['count'], 1)

    def test_pagination(self):
        res = self.client.get(LEDGER, {'page_size': 2, 'page': 1}).data
        self.assertEqual(len(res['results']), 2)
        self.assertEqual(res['next'], 2)
        res2 = self.client.get(LEDGER, {'page_size': 2, 'page': 2}).data
        self.assertEqual(len(res2['results']), 1)
        self.assertIsNone(res2['next'])

    def test_anonymous_blocked(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(LEDGER).status_code, 401)


class KhataModelTests(APITestCase):
    def test_amount_must_be_positive(self):
        from django.db import IntegrityError, transaction

        customer = Customer.objects.create(name='X')
        with self.assertRaises(IntegrityError), transaction.atomic():
            KhataCharge.objects.create(customer=customer, amount=Decimal('0'), charge_date='2025-01-01')
        with self.assertRaises(IntegrityError), transaction.atomic():
            KhataPayment.objects.create(customer=customer, amount=Decimal('-5'), paid_on='2025-01-01')
