from decimal import Decimal

from rest_framework.test import APITestCase

from apps.accounts.models import User, UserRole

from .models import Customer

CUSTOMERS = '/api/customers/'


def make_user(role, email=None):
    return User.objects.create_user(email=email or f'{role.lower()}@x.com', password='S3cure-pass!', name=role.title(), role=role)


class CustomerTestBase(APITestCase):
    def setUp(self):
        self.owner = make_user(UserRole.OWNER)
        self.client.force_authenticate(self.owner)


class CustomerApiTests(CustomerTestBase):
    def test_create_with_zero_balance(self):
        res = self.client.post(CUSTOMERS, {'name': 'Chaudhry Riaz Ahmed', 'phone': '0300-1234567'}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(Decimal(res.data['outstanding_balance']), Decimal('0'))
        self.assertFalse(res.data['over_credit_limit'])

    def test_balances_are_isolated_per_customer(self):
        # Same class of bug as the suppliers app: verify with more than one customer, not just one.
        from apps.khata.models import KhataCharge, KhataPayment

        with_charge = Customer.objects.create(name='Has Charge', credit_limit=Decimal('50000'))
        KhataCharge.objects.create(customer=with_charge, amount=Decimal('20000'), charge_date='2025-01-01')
        KhataPayment.objects.create(customer=with_charge, amount=Decimal('5000'), paid_on='2025-01-05')
        untouched = Customer.objects.create(name='No Activity')

        rows = {r['name']: r for r in self.client.get(CUSTOMERS).data['results']}
        self.assertEqual(Decimal(rows['Has Charge']['outstanding_balance']), Decimal('15000'))
        self.assertFalse(rows['Has Charge']['over_credit_limit'])
        self.assertEqual(Decimal(rows['No Activity']['outstanding_balance']), Decimal('0'))

    def test_over_credit_limit_flag(self):
        from apps.khata.models import KhataCharge

        customer = Customer.objects.create(name='Near Limit', credit_limit=Decimal('10000'))
        KhataCharge.objects.create(customer=customer, amount=Decimal('15000'), charge_date='2025-01-01')
        data = self.client.get(f'{CUSTOMERS}{customer.pk}/').data
        self.assertTrue(data['over_credit_limit'])

    def test_record_charge_then_payment_via_actions(self):
        customer_id = self.client.post(CUSTOMERS, {'name': 'Malik Tariq'}, format='json').data['id']
        res = self.client.post(f'{CUSTOMERS}{customer_id}/charge/', {'amount': '5000', 'description': 'Fertilizer', 'charge_date': '2025-02-01'}, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(Decimal(res.data['outstanding_balance']), Decimal('5000'))

        res = self.client.post(f'{CUSTOMERS}{customer_id}/pay/', {'amount': '2000', 'method': 'CASH', 'paid_on': '2025-02-10'}, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(Decimal(res.data['outstanding_balance']), Decimal('3000'))

    def test_payment_may_exceed_balance_advance_allowed(self):
        customer_id = self.client.post(CUSTOMERS, {'name': 'Advance Payer'}, format='json').data['id']
        res = self.client.post(f'{CUSTOMERS}{customer_id}/pay/', {'amount': '1000', 'paid_on': '2025-02-10'}, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(Decimal(res.data['outstanding_balance']), Decimal('-1000'))

    def test_ledger_action_combines_and_orders_entries(self):
        customer_id = self.client.post(CUSTOMERS, {'name': 'Ledger Farmer'}, format='json').data['id']
        self.client.post(f'{CUSTOMERS}{customer_id}/charge/', {'amount': '1000', 'charge_date': '2025-01-01'}, format='json')
        self.client.post(f'{CUSTOMERS}{customer_id}/pay/', {'amount': '400', 'paid_on': '2025-01-05'}, format='json')
        rows = self.client.get(f'{CUSTOMERS}{customer_id}/ledger/').data
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]['type'], 'PAYMENT')  # most recent first
        self.assertEqual(rows[1]['type'], 'CHARGE')

    def test_invalid_amounts_rejected(self):
        customer_id = self.client.post(CUSTOMERS, {'name': 'X'}, format='json').data['id']
        self.assertEqual(self.client.post(f'{CUSTOMERS}{customer_id}/charge/', {'amount': '0', 'charge_date': '2025-01-01'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(f'{CUSTOMERS}{customer_id}/pay/', {'amount': '-5', 'paid_on': '2025-01-01'}, format='json').status_code, 400)

    def test_delete_blocked_with_history_allowed_without(self):
        history = self.client.post(CUSTOMERS, {'name': 'With History'}, format='json').data['id']
        self.client.post(f'{CUSTOMERS}{history}/charge/', {'amount': '100', 'charge_date': '2025-01-01'}, format='json')
        self.assertEqual(self.client.delete(f'{CUSTOMERS}{history}/').status_code, 400)

        clean = self.client.post(CUSTOMERS, {'name': 'Clean'}, format='json').data['id']
        self.assertEqual(self.client.delete(f'{CUSTOMERS}{clean}/').status_code, 204)
        self.assertTrue(Customer.all_objects.get(pk=clean).is_deleted)

    def test_search_and_balance_filter(self):
        from apps.khata.models import KhataCharge

        Customer.objects.create(name='Kot Momin Farmer', village='Kot Momin')
        due = Customer.objects.create(name='Due Farmer')
        KhataCharge.objects.create(customer=due, amount=Decimal('500'), charge_date='2025-01-01')
        self.assertEqual(self.client.get(CUSTOMERS, {'search': 'kot momin'}).data['count'], 1)
        self.assertEqual(self.client.get(CUSTOMERS, {'has_balance': 'true'}).data['count'], 1)

    def test_every_role_can_read_and_write(self):
        customer_id = Customer.objects.create(name='Shared').pk
        for role in (UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.SALESMAN):
            self.client.force_authenticate(make_user(role))
            self.assertEqual(self.client.get(CUSTOMERS).status_code, 200)
            self.assertEqual(
                self.client.post(f'{CUSTOMERS}{customer_id}/charge/', {'amount': '10', 'charge_date': '2025-01-01'}, format='json').status_code,
                201,
            )

    def test_anonymous_blocked(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(CUSTOMERS).status_code, 401)
