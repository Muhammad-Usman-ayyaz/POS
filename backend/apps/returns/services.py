from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from rest_framework.exceptions import ValidationError

from apps.audit.services import log_action
from apps.inventory.models import MovementType
from apps.inventory.services import apply_stock_movement
from apps.khata.models import KhataPayment, PaymentMethod
from apps.sales.models import Sale

from .models import RefundMethod, SalesReturn, SalesReturnItem


@transaction.atomic
def create_return(*, sale: Sale, return_date, reason: str, refund_method: str, lines: list, user=None):
    """
    `lines` is [{'sale_item': SaleItem, 'quantity': Decimal}, ...]. Each line's stock goes back
    into the batch it was sold from (quantity capped at what hasn't already been returned for that
    line), then the return's total value is settled: a cash refund is just recorded on the return
    itself, a khata credit reduces the customer's outstanding balance via a KhataPayment, exactly
    like a real payment would.
    """
    if sale.status == Sale.Status.CANCELLED:
        raise ValidationError({'detail': 'Cannot return items from a cancelled sale.'})
    if not lines:
        raise ValidationError({'lines': 'At least one item is required.'})
    if refund_method == RefundMethod.KHATA_CREDIT and sale.customer_id is None:
        raise ValidationError({'refund_method': 'Khata credit requires the sale to have a customer.'})

    sales_return = SalesReturn.objects.create(
        sale=sale, return_date=return_date, reason=reason, refund_method=refund_method,
        created_by=user if getattr(user, 'is_authenticated', False) else None,
    )

    total = Decimal('0')
    for line in lines:
        sale_item = line['sale_item']
        quantity = line['quantity']
        if sale_item.sale_id != sale.pk:
            raise ValidationError({'lines': 'One of these items does not belong to this sale.'})

        already_returned = SalesReturnItem.objects.filter(sale_item=sale_item).aggregate(
            total=Sum('quantity')
        )['total'] or Decimal('0')
        remaining = sale_item.quantity - already_returned
        if quantity > remaining:
            raise ValidationError({
                'lines': f'Only {remaining} of {sale_item.product.sku} can still be returned from this sale.'
            })

        SalesReturnItem.objects.create(
            sales_return=sales_return, sale_item=sale_item, quantity=quantity, unit_price=sale_item.unit_price,
        )
        total += quantity * sale_item.unit_price

        apply_stock_movement(
            batch=sale_item.batch, movement_type=MovementType.RETURN_IN, quantity=quantity,
            user=user, reference=sales_return.return_no, note=f'Returned from {sale.invoice_no}',
        )

    if refund_method == RefundMethod.KHATA_CREDIT:
        KhataPayment.objects.create(
            customer=sale.customer, amount=total, method=PaymentMethod.ADJUSTMENT, paid_on=return_date,
            note=f'Return credit for {sale.invoice_no} ({sales_return.return_no})',
            created_by=user if getattr(user, 'is_authenticated', False) else None,
        )

    log_action(
        actor=user, action='SALE_RETURN_CREATED', target_type='SalesReturn', target_id=sales_return.pk,
        summary=f'{sales_return.return_no} — Rs. {total} returned from {sale.invoice_no}'
                f'{" (khata credited)" if refund_method == RefundMethod.KHATA_CREDIT else " (cash refund)"}',
    )
    return sales_return
