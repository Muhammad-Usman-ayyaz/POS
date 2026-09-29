from datetime import date
from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.audit.services import log_action
from apps.inventory.models import MovementType
from apps.inventory.services import apply_stock_movement
from apps.khata.models import KhataCharge

from .models import Sale, SaleItem, SalePaymentMethod


@transaction.atomic
def create_sale(*, customer, sale_date: date, payment_method: str, discount_amount, notes: str, lines: list, paid_amount=None, user=None):
    """
    The one path allowed to record a till transaction: deducts stock for every line (locked,
    atomic, blocked on insufficient stock — same guarantee as purchases), then settles the total
    between an immediate payment and khata credit. `paid_amount` defaults to the full total (an
    ordinary fully-paid sale); passing less than the total splits the difference to khata credit,
    and `payment_method=KHATA` is shorthand for paying nothing now (`paid_amount` forced to 0).
    Either way, whatever's left of the total is posted as one KhataCharge so the farmer's ledger
    and the invoice always agree.
    """
    if not lines:
        raise ValidationError({'lines': 'At least one item is required.'})

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
        actual_paid = Decimal('0')
    elif paid_amount is None:
        actual_paid = total
    else:
        actual_paid = paid_amount
        if actual_paid < 0 or actual_paid > total:
            raise ValidationError({'paid_amount': f'Must be between 0 and the sale total of {total}.'})

    balance = total - actual_paid
    if balance > 0 and customer is None:
        raise ValidationError({'customer': 'A customer is required to charge the remaining balance to khata.'})

    sale.paid_amount = actual_paid
    if balance > 0:
        charge = KhataCharge.objects.create(
            customer=customer, amount=balance,
            description=(
                f'INV-{sale.pk} — credit sale' if actual_paid == 0
                else f'INV-{sale.pk} — balance after Rs. {actual_paid} paid via {sale.get_payment_method_display()}'
            ),
            charge_date=sale_date, created_by=user if getattr(user, 'is_authenticated', False) else None,
        )
        sale.khata_charge = charge
    sale.save(update_fields=['paid_amount', 'khata_charge'])

    log_action(
        actor=user, action='SALE_CREATED', target_type='Sale', target_id=sale.pk,
        summary=f'{sale.invoice_no} — Rs. {total} total, Rs. {actual_paid} paid via {sale.get_payment_method_display()}'
                f'{f", Rs. {balance} to khata" if balance > 0 else ""}'
                f'{f" ({customer.name})" if customer else " (walk-in)"}',
    )
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
    log_action(actor=user, action='SALE_CANCELLED', target_type='Sale', target_id=sale.pk, summary=f'{sale.invoice_no} cancelled')
    return sale
