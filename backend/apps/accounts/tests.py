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
