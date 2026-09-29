from decimal import Decimal

from django.db import migrations


def backfill_paid_amount(apps, schema_editor):
    Sale = apps.get_model('sales', 'Sale')
    for sale in Sale.objects.prefetch_related('items').all():
        if sale.payment_method == 'KHATA':
            sale.paid_amount = Decimal('0')
        else:
            subtotal = sum((item.quantity * item.unit_price for item in sale.items.all()), start=Decimal('0'))
            sale.paid_amount = subtotal - sale.discount_amount
        sale.save(update_fields=['paid_amount'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0002_sale_paid_amount_sale_sale_paid_amount_gte_0'),
    ]

    operations = [
        migrations.RunPython(backfill_paid_amount, noop_reverse),
    ]
