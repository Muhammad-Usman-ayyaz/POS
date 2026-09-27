from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.catalog.models import Batch

from .models import MovementType, StockMovement


@transaction.atomic
def apply_stock_movement(*, batch: Batch, movement_type: str, quantity: Decimal, user=None, reference='', note=''):
    """
    The one path allowed to change a batch's quantity. Locks the row, applies the signed delta,
    and writes the ledger entry in the same transaction so `batch.quantity` and the movement
    history can never drift apart.
    """
    if quantity <= 0:
        raise ValidationError({'quantity': 'Quantity must be greater than zero.'})

    locked_batch = Batch.objects.select_for_update().get(pk=batch.pk)
    delta = quantity if movement_type in MovementType.inbound() else -quantity
    new_quantity = locked_batch.quantity + delta
    if new_quantity < 0:
        raise ValidationError({'quantity': f'Only {locked_batch.quantity} in stock for this batch.'})

    locked_batch.quantity = new_quantity
    locked_batch.save(update_fields=['quantity', 'updated_at'])

    return StockMovement.objects.create(
        product=locked_batch.product,
        batch=locked_batch,
        movement_type=movement_type,
        quantity=quantity,
        balance_after=new_quantity,
        reference=reference,
        note=note,
        created_by=user if getattr(user, 'is_authenticated', False) else None,
    )


@transaction.atomic
def get_or_create_batch_for_purchase(*, product, batch_no: str, expiry_date):
    """Purchases append to an existing batch (same product + batch_no) rather than duplicating it."""
    batch_no = batch_no.strip() or 'UNSPECIFIED'
    batch, created = Batch.objects.select_for_update().get_or_create(
        product=product, batch_no=batch_no, defaults={'expiry_date': expiry_date, 'quantity': 0},
    )
    if not created and expiry_date and batch.expiry_date != expiry_date:
        raise ValidationError({
            'batch_no': f'Batch "{batch_no}" already exists for this product with expiry '
                        f'{batch.expiry_date}. Use a different batch number for a different expiry.'
        })
    return batch
