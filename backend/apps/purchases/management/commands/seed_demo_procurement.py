from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import User
from apps.catalog.models import Product
from apps.purchases.models import Purchase, PurchaseItem, SupplierPayment
from apps.suppliers.models import Supplier

SUPPLIERS = [
    ('Agri-Tech Ltd', '0300-1234567', 'Multan Road, Lahore'),
    ('Direct Import Co.', '0321-9988776', 'Karachi Port Trust Area'),
    ('Regional Supply House', '0333-4455667', 'Faisalabad Grain Market'),
]


class Command(BaseCommand):
    help = 'Create sample suppliers plus one received (and part-paid) purchase, for development only.'

    @transaction.atomic
    def handle(self, *args, **options):
        created_suppliers = 0
        for name, phone, address in SUPPLIERS:
            _, made = Supplier.objects.get_or_create(name=name, defaults={'phone': phone, 'address': address})
            created_suppliers += int(made)

        if Purchase.objects.exists():
            self.stdout.write(self.style.WARNING('A purchase already exists — skipping sample purchase.'))
            return

        product = Product.objects.filter(is_deleted=False).first()
        if product is None:
            self.stdout.write(self.style.WARNING('No products found — run seed_demo_catalog first.'))
            return

        supplier = Supplier.objects.get(name='Agri-Tech Ltd')
        user = User.objects.filter(is_superuser=True).first() or User.objects.first()
        purchase = Purchase.objects.create(
            supplier=supplier, invoice_no='INV-DEMO-1', purchase_date=date.today() - timedelta(days=10),
            notes='Demo seed purchase', created_by=user,
        )
        PurchaseItem.objects.create(
            purchase=purchase, product=product, batch_no='DEMO-BATCH-1',
            expiry_date=date.today() + timedelta(days=540), quantity=Decimal('25'), unit_cost=product.purchase_price or Decimal('100'),
        )
        # Stock/ledger for this line item is applied through the API's create path only, so we
        # replicate it here rather than importing PurchaseSerializer's private create logic.
        from apps.inventory.models import MovementType
        from apps.inventory.services import apply_stock_movement, get_or_create_batch_for_purchase

        batch = get_or_create_batch_for_purchase(product=product, batch_no='DEMO-BATCH-1', expiry_date=purchase.items.first().expiry_date)
        apply_stock_movement(
            batch=batch, movement_type=MovementType.PURCHASE_IN, quantity=Decimal('25'), user=user,
            reference=f'PUR-{purchase.pk}', note='Demo seed purchase',
        )
        SupplierPayment.objects.create(purchase=purchase, amount=purchase.total_amount / 2, paid_on=date.today(), note='Demo partial payment')

        self.stdout.write(self.style.SUCCESS(
            f'Seeded {created_suppliers} supplier(s) and 1 demo purchase (PUR-{purchase.pk}, half paid).'
        ))
