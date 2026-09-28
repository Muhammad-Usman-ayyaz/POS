from datetime import date

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.inventory.models import MovementType
from apps.inventory.services import apply_stock_movement
from apps.khata.models import KhataCharge

from .models import Sale, SaleItem, SalePaymentMethod


@transaction.atomic
def create_sale(*, customer, sale_date: date, payment_method: str, discount_amount, notes: str, lines: list, user=None):
    """
    The one path allowed to record a till transaction: deducts stock for every line (locked,
    atomic, blocked on insufficient stock — same guarantee as purchases) and, for a KHATA sale,
    posts the total as a single KhataCharge so the farmer's ledger and the invoice always agree.
    """
    if not lines:
        raise ValidationError({'lines': 'At least one item is required.'})
    if payment_method == SalePaymentMethod.KHATA and customer is None:
        raise ValidationError({'customer': 'A customer is required for a khata (credit) sale.'})

    sale = Sale.objects.create(
        customer=customer, sale_date=sale_date, payment_method=payment_method,
        discount_amount=discount_amount, notes=notes, created_by=user if getattr(user, 'is_authenticated', False) else None,
    )

    subtotal = 0
    for line in lines:
        item = SaleItem.objects.create(
            sale=sale, product=line['product'], batch=line['batch'],
            quantity=line['quantity'], unit_price=line['unit_price'],
        )
        subtotal += item.line_total
        apply_stock_movement(
            batch=line['batch'], movement_type=MovementType.SALE_OUT, quantity=line['quantity'],
            user=user, reference=f'INV-{sale.pk}', note=f'Sold via {sale.get_payment_method_display()}',
        )

    total = subtotal - sale.discount_amount
    if total < 0:
        raise ValidationError({'discount_amount': 'Discount cannot exceed the sale subtotal.'})

    if payment_method == SalePaymentMethod.KHATA:
        charge = KhataCharge.objects.create(
            customer=customer, amount=total, description=f'INV-{sale.pk} — credit sale',
            charge_date=sale_date, created_by=user if getattr(user, 'is_authenticated', False) else None,
        )
        sale.khata_charge = charge
        sale.save(update_fields=['khata_charge'])

    return sale


@transaction.atomic
def cancel_sale(*, sale: Sale, user=None):
    if sale.status == Sale.Status.CANCELLED:
        raise ValidationError({'detail': 'This sale is already cancelled.'})

    for item in sale.items.select_related('batch').all():
        apply_stock_movement(
            batch=item.batch, movement_type=MovementType.SALE_REVERSED, quantity=item.quantity,
            user=user, reference=f'INV-{sale.pk}', note='Sale cancelled',
        )

    if sale.khata_charge_id:
        sale.khata_charge.delete()
        sale.khata_charge = None

    sale.status = Sale.Status.CANCELLED
    sale.save(update_fields=['status', 'khata_charge'])
    return sale
