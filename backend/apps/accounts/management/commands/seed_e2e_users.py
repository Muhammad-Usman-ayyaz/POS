from django.core.management.base import BaseCommand

from apps.accounts.models import User, UserRole

# Matches the fallback credentials hardcoded in frontend/e2e/*.spec.ts (overridable there via
# E2E_OWNER_EMAIL/E2E_OWNER_PASSWORD/E2E_SALES_EMAIL/E2E_SALES_PASSWORD).
E2E_USERS = [
    ('owner@pesticideclub.com', 'Owner-pass-123', 'E2E Owner', UserRole.OWNER),
    ('pos@pesticideclub.com', 'Sales-pass-123', 'E2E Salesman', UserRole.SALESMAN),
]


class Command(BaseCommand):
    help = 'Create (or reset the password of) the two fixed users the Playwright e2e suite logs in as.'

    def handle(self, *args, **options):
        for email, password, name, role in E2E_USERS:
            user, created = User.objects.get_or_create(email=email, defaults={'name': name, 'role': role})
            user.set_password(password)
            user.role = role
            user.is_active = True
            user.save()
            self.stdout.write(self.style.SUCCESS(f'{"Created" if created else "Reset"} {email} ({role})'))
