from decimal import Decimal

from rest_framework.test import APITestCase

from apps.accounts.models import User, UserRole
from apps.catalog.models import Batch, Brand, Category, Product
from apps.customers.models import Customer
from apps.sales.services import cancel_sale, create_sale
from apps.suppliers.models import Supplier

from .models import AuditLog

AUDIT = '/api/audit-logs/'


def make_user(role, email=None):
    return User.objects.create_user(email=email or f'{role.lower()}@x.com', password='S3cure-pass!', name=role.title(), role=role)


class AuditLogTestBase(APITestCase):
    def setUp(self):
        self.owner = make_user(UserRole.OWNER)
        self.client.force_authenticate(self.owner)
        self.category = Category.objects.get(name='Insecticide')
        self.brand = Brand.objects.get(name='Syngenta Ag')
        self.product = Product.objects.create(name='Coragen', sku='COR-1', category=self.category, brand=self.brand, selling_price=Decimal('100'))
        self.batch = Batch.objects.create(product=self.product, batch_no='B1', quantity=Decimal('50'))


class SaleAndPurchaseAuditTests(AuditLogTestBase):
    def test_sale_creation_and_cancellation_logged(self):
        sale = create_sale(
            customer=None, sale_date='2025-06-01', payment_method='CASH', discount_amount=Decimal('0'), notes='', user=self.owner,
            lines=[{'product': self.product, 'batch': self.batch, 'quantity': Decimal('5'), 'unit_price': Decimal('100')}],
        )
        self.assertTrue(AuditLog.objects.filter(action='SALE_CREATED', target_id=str(sale.pk)).exists())
        cancel_sale(sale=sale, user=self.owner)
        self.assertTrue(AuditLog.objects.filter(action='SALE_CANCELLED', target_id=str(sale.pk)).exists())

    def test_purchase_received_logged(self):
        supplier = Supplier.objects.create(name='Agri-Tech Ltd')
        res = self.client.post('/api/purchases/', {
            'supplier': supplier.pk, 'purchase_date': '2025-06-01',
            'items_input': [{'product': self.product.pk, 'batch_no': 'PB1', 'quantity': '10', 'unit_cost': '50'}],
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertTrue(AuditLog.objects.filter(action='PURCHASE_RECEIVED', target_id=str(res.data['id'])).exists())

    def test_khata_charge_and_payment_logged(self):
        customer = Customer.objects.create(name='Test Farmer', credit_limit=Decimal('50000'))
        res = self.client.post(f'/api/customers/{customer.pk}/charge/', {'amount': '1000', 'charge_date': '2025-06-01'}, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertTrue(AuditLog.objects.filter(action='KHATA_CHARGE_RECORDED', target_id=str(customer.pk)).exists())

        res = self.client.post(f'/api/customers/{customer.pk}/pay/', {'amount': '400', 'paid_on': '2025-06-02'}, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertTrue(AuditLog.objects.filter(action='KHATA_PAYMENT_RECORDED', target_id=str(customer.pk)).exists())

    def test_stock_adjustment_logged(self):
        res = self.client.post('/api/inventory/adjustments/', {'batch': self.batch.pk, 'movement_type': 'DAMAGED', 'quantity': '2'}, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertTrue(AuditLog.objects.filter(action='STOCK_ADJUSTED', target_id=str(self.batch.pk)).exists())


class EmployeeAndLoginAuditTests(AuditLogTestBase):
    def test_employee_lifecycle_logged(self):
        res = self.client.post('/api/employees/', {'name': 'New Hire', 'email': 'nh@x.com', 'role': 'SALESMAN', 'password': 'S3cure-pass!'}, format='json')
        self.assertEqual(res.status_code, 201)
        emp_id = res.data['id']
        self.assertTrue(AuditLog.objects.filter(action='EMPLOYEE_CREATED', target_id=str(emp_id)).exists())

        self.client.patch(f'/api/employees/{emp_id}/', {'name': 'Renamed'}, format='json')
        self.assertTrue(AuditLog.objects.filter(action='EMPLOYEE_UPDATED', target_id=str(emp_id)).exists())

        self.client.delete(f'/api/employees/{emp_id}/')
        self.assertTrue(AuditLog.objects.filter(action='EMPLOYEE_DEACTIVATED', target_id=str(emp_id)).exists())

        self.client.post(f'/api/employees/{emp_id}/reactivate/')
        self.assertTrue(AuditLog.objects.filter(action='EMPLOYEE_REACTIVATED', target_id=str(emp_id)).exists())

    def test_login_success_and_failure_logged(self):
        self.client.logout()
        self.client.post('/api/auth/token/', {'email': self.owner.email, 'password': 'S3cure-pass!'}, format='json')
        self.assertTrue(AuditLog.objects.filter(action='LOGIN_SUCCESS').exists())

        self.client.post('/api/auth/token/', {'email': self.owner.email, 'password': 'wrong'}, format='json')
        self.assertTrue(AuditLog.objects.filter(action='LOGIN_FAILED').exists())


class AuditLogPermissionTests(AuditLogTestBase):
    def test_owner_and_manager_can_view(self):
        AuditLog.objects.create(actor=self.owner, actor_name='Owner', action='LOGIN_SUCCESS', summary='test')
        self.assertEqual(self.client.get(AUDIT).status_code, 200)
        self.client.force_authenticate(make_user(UserRole.MANAGER))
        self.assertEqual(self.client.get(AUDIT).status_code, 200)

    def test_salesman_and_accountant_forbidden(self):
        for role in (UserRole.SALESMAN, UserRole.ACCOUNTANT):
            self.client.force_authenticate(make_user(role))
            self.assertEqual(self.client.get(AUDIT).status_code, 403)

    def test_read_only(self):
        self.assertEqual(self.client.post(AUDIT, {'action': 'FAKE', 'summary': 'x'}, format='json').status_code, 405)

    def test_search_and_action_filter(self):
        AuditLog.objects.create(actor=self.owner, actor_name='Owner', action='LOGIN_SUCCESS', summary='owner@x.com signed in')
        AuditLog.objects.create(actor=self.owner, actor_name='Owner', action='EMPLOYEE_CREATED', summary='New Hire added')
        self.assertEqual(self.client.get(AUDIT, {'action': 'LOGIN_SUCCESS'}).data['count'], 1)
        self.assertEqual(self.client.get(AUDIT, {'search': 'New Hire'}).data['count'], 1)
