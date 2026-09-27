from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.customers.models import Customer

from ...models import KhataCharge, KhataPayment

FARMERS = [
    # name, phone, cnic, village, credit_limit, charge, payment
    ('Chaudhry Riaz Ahmed', '0300-8712394', '33100-8492019-3', 'Chak 42-RB, Tehsil Faisalabad', Decimal('200000'), Decimal('145000'), Decimal('130500')),
    ('Malik Tariq Mehmood', '0321-6549821', '38403-1249821-1', 'Kot Momin, Sargodha', Decimal('300000'), Decimal('284000'), Decimal('275580')),
    ('Haji Munir Gujjar', '0345-7193021', '38402-9938472-7', 'Bhalwal Mandi', Decimal('100000'), Decimal('92000'), Decimal('85800')),
]


class Command(BaseCommand):
    help = 'Create sample farmers with a khata charge and partial payment, for development only.'

    @transaction.atomic
    def handle(self, *args, **options):
        created = 0
        today = date.today()
        for name, phone, cnic, village, limit, charge, payment in FARMERS:
            customer, made = Customer.objects.get_or_create(
                name=name, defaults={'phone': phone, 'cnic': cnic, 'village': village, 'credit_limit': limit},
            )
            if not made:
                continue
            KhataCharge.objects.create(customer=customer, amount=charge, description='Season inputs on credit', charge_date=today - timedelta(days=20))
            KhataPayment.objects.create(customer=customer, amount=payment, paid_on=today - timedelta(days=5))
            created += 1
        if options.get('verbosity', 1) > 0:
            self.stdout.write(self.style.SUCCESS(f'Seeded {created} demo farmer(s) with khata history.'))
