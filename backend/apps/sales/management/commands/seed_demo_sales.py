from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand

from apps.accounts.models import User
from apps.catalog.models import Batch
from apps.customers.models import Customer
from apps.sales.models import Sale
from apps.sales.services import create_sale


class Command(BaseCommand):
    help = 'Create a few sample POS sales (cash and khata), for development only.'

    def handle(self, *args, **options):
        if Sale.objects.exists():
            self.stdout.write(self.style.WARNING('Sales already exist — skipping.'))
            return

        batches = list(Batch.objects.filter(quantity__gt=0).select_related('product')[:3])
        if not batches:
            self.stdout.write(self.style.WARNING('No stocked batches found — run seed_demo_catalog and seed_demo_procurement first.'))
            return

        user = User.objects.filter(is_superuser=True).first() or User.objects.first()
        customer = Customer.objects.first()

        create_sale(
            customer=None, sale_date=date.today(), payment_method='CASH', discount_amount=Decimal('0'),
            notes='Demo walk-in cash sale', user=user,
            lines=[{'product': batches[0].product, 'batch': batches[0], 'quantity': Decimal('2'), 'unit_price': batches[0].product.selling_price or Decimal('100')}],
        )

        if customer:
            create_sale(
                customer=customer, sale_date=date.today() - timedelta(days=1), payment_method='KHATA', discount_amount=Decimal('0'),
                notes='Demo credit sale', user=user,
                lines=[{'product': batches[0].product, 'batch': batches[0], 'quantity': Decimal('1'), 'unit_price': batches[0].product.selling_price or Decimal('100')}],
            )

        self.stdout.write(self.style.SUCCESS(f'Seeded {Sale.objects.count()} demo sale(s).'))
