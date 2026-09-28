from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from .models import User, UserRole


class AuthApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            email='owner@pesticideclub.com', password='S3cure-pass!', name='Owner', role=UserRole.OWNER,
        )
        self.login_url = reverse('token_obtain_pair')

    def _login(self, password='S3cure-pass!'):
        return self.client.post(self.login_url, {'email': 'owner@pesticideclub.com', 'password': password}, format='json')

    def test_login_returns_tokens_and_real_role(self):
        res = self._login()
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['user']['role'], 'OWNER')
        self.assertIn('access', res.data)
        self.assertIn('refresh', res.data)

    def test_wrong_password_rejected(self):
        self.assertEqual(self._login('nope').status_code, 401)

    def test_inactive_user_rejected(self):
        self.user.is_active = False
        self.user.save()
        self.assertEqual(self._login().status_code, 401)

    def test_me_requires_auth_and_returns_profile(self):
        self.assertEqual(self.client.get(reverse('current_user')).status_code, 401)
        access = self._login().data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        res = self.client.get(reverse('current_user'))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['email'], 'owner@pesticideclub.com')

    def test_refresh_rotates_and_old_token_is_blacklisted(self):
        refresh = self._login().data['refresh']
        url = reverse('token_refresh')
        first = self.client.post(url, {'refresh': refresh}, format='json')
        self.assertEqual(first.status_code, 200)
        self.assertIn('refresh', first.data)
        self.assertEqual(self.client.post(url, {'refresh': refresh}, format='json').status_code, 401)

    def test_logout_blacklists_refresh_token(self):
        data = self._login().data
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {data["access"]}')
        self.assertEqual(self.client.post(reverse('logout'), {'refresh': data['refresh']}, format='json').status_code, 204)
        res = self.client.post(reverse('token_refresh'), {'refresh': data['refresh']}, format='json')
        self.assertEqual(res.status_code, 401)

    def test_logout_rejects_other_users_token(self):
        other = User.objects.create_user(email='b@x.com', password='S3cure-pass!', name='B')
        other_refresh = self.client.post(self.login_url, {'email': 'b@x.com', 'password': 'S3cure-pass!'}, format='json').data['refresh']
        access = self._login().data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        self.assertEqual(self.client.post(reverse('logout'), {'refresh': other_refresh}, format='json').status_code, 400)
        self.assertIsNotNone(other)

    def test_login_is_throttled(self):
        statuses = [self._login('bad').status_code for _ in range(12)]
        self.assertEqual(statuses[-1], 429)


EMPLOYEES = '/api/employees/'


class ChangePasswordTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='a@x.com', password='Old-pass1!', name='A', role=UserRole.SALESMAN)
        self.client.force_authenticate(self.user)

    def test_wrong_current_password_rejected(self):
        res = self.client.post(reverse('change_password'), {'current_password': 'wrong', 'new_password': 'New-pass1!'}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_change_password_then_login_with_new_one(self):
        res = self.client.post(reverse('change_password'), {'current_password': 'Old-pass1!', 'new_password': 'New-pass1!'}, format='json')
        self.assertEqual(res.status_code, 204)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('New-pass1!'))

    def test_new_password_too_short_rejected(self):
        res = self.client.post(reverse('change_password'), {'current_password': 'Old-pass1!', 'new_password': 'short'}, format='json')
        self.assertEqual(res.status_code, 400)


class EmployeeTestBase(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email='owner@x.com', password='S3cure-pass!', name='Owner', role=UserRole.OWNER)
        self.manager = User.objects.create_user(email='manager@x.com', password='S3cure-pass!', name='Manager', role=UserRole.MANAGER)
        self.client.force_authenticate(self.owner)


class EmployeeCreateTests(EmployeeTestBase):
    def test_owner_can_create_employee(self):
        res = self.client.post(EMPLOYEES, {'name': 'New Salesman', 'email': 's@x.com', 'role': 'SALESMAN', 'password': 'S3cure-pass!'}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertTrue(User.objects.get(email='s@x.com').check_password('S3cure-pass!'))

    def test_password_required_on_create(self):
        res = self.client.post(EMPLOYEES, {'name': 'No Pass', 'email': 'np@x.com', 'role': 'SALESMAN'}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_manager_cannot_create_owner(self):
        self.client.force_authenticate(self.manager)
        res = self.client.post(EMPLOYEES, {'name': 'New Owner', 'email': 'o2@x.com', 'role': 'OWNER', 'password': 'S3cure-pass!'}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_manager_can_create_salesman(self):
        self.client.force_authenticate(self.manager)
        res = self.client.post(EMPLOYEES, {'name': 'New Salesman', 'email': 's2@x.com', 'role': 'SALESMAN', 'password': 'S3cure-pass!'}, format='json')
        self.assertEqual(res.status_code, 201)

    def test_salesman_forbidden(self):
        salesman = User.objects.create_user(email='sm@x.com', password='S3cure-pass!', name='SM', role=UserRole.SALESMAN)
        self.client.force_authenticate(salesman)
        self.assertEqual(self.client.get(EMPLOYEES).status_code, 403)


class EmployeeUpdateAndDeactivateTests(EmployeeTestBase):
    def setUp(self):
        super().setUp()
        self.salesman = User.objects.create_user(email='sm@x.com', password='S3cure-pass!', name='SM', role=UserRole.SALESMAN)

    def test_update_role_and_reset_password(self):
        res = self.client.patch(f'{EMPLOYEES}{self.salesman.pk}/', {'role': 'ACCOUNTANT', 'password': 'Reset-pass1!'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.salesman.refresh_from_db()
        self.assertEqual(self.salesman.role, 'ACCOUNTANT')
        self.assertTrue(self.salesman.check_password('Reset-pass1!'))

    def test_deactivate_then_reactivate(self):
        res = self.client.delete(f'{EMPLOYEES}{self.salesman.pk}/')
        self.assertEqual(res.status_code, 200)
        self.salesman.refresh_from_db()
        self.assertFalse(self.salesman.is_active)
        res = self.client.post(f'{EMPLOYEES}{self.salesman.pk}/reactivate/')
        self.assertEqual(res.status_code, 200)
        self.salesman.refresh_from_db()
        self.assertTrue(self.salesman.is_active)

    def test_cannot_deactivate_self(self):
        res = self.client.delete(f'{EMPLOYEES}{self.owner.pk}/')
        self.assertEqual(res.status_code, 400)

    def test_manager_cannot_deactivate_owner(self):
        self.client.force_authenticate(self.manager)
        res = self.client.delete(f'{EMPLOYEES}{self.owner.pk}/')
        self.assertEqual(res.status_code, 400)

    def test_manager_cannot_edit_owner_role(self):
        self.client.force_authenticate(self.manager)
        res = self.client.patch(f'{EMPLOYEES}{self.owner.pk}/', {'name': 'Renamed Owner'}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_search_filter(self):
        res = self.client.get(EMPLOYEES, {'search': 'SM'})
        self.assertEqual(res.data['count'], 1)
