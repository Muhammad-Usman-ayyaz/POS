from django.conf import settings
from django.db import models
from django.db.models import Q


class MovementType(models.TextChoices):
    PURCHASE_IN = 'PURCHASE_IN', 'Purchase Received'
    SALE_OUT = 'SALE_OUT', 'Sold'
    ADJUSTMENT_IN = 'ADJUSTMENT_IN', 'Stock Adjustment (Add)'
    ADJUSTMENT_OUT = 'ADJUSTMENT_OUT', 'Stock Adjustment (Remove)'
    DAMAGED = 'DAMAGED', 'Damaged Stock'
    EXPIRED = 'EXPIRED', 'Expired Stock'
    PURCHASE_REVERSED = 'PURCHASE_REVERSED', 'Purchase Cancelled'
    SALE_REVERSED = 'SALE_REVERSED', 'Sale Cancelled'
    RETURN_IN = 'RETURN_IN', 'Customer Return'

    # A movement decreases stock unless it's one of these.
    @classmethod
    def inbound(cls):
        return {cls.PURCHASE_IN, cls.ADJUSTMENT_IN, cls.SALE_REVERSED, cls.RETURN_IN}


class StockMovement(models.Model):
    """Append-only ledger. A batch's quantity is always the sum of its movements' signed deltas."""

    product = models.ForeignKey('catalog.Product', on_delete=models.PROTECT, related_name='stock_movements')
    batch = models.ForeignKey('catalog.Batch', on_delete=models.PROTECT, related_name='movements')
    movement_type = models.CharField(max_length=20, choices=MovementType.choices)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, help_text='Always positive; direction comes from movement_type.')
    balance_after = models.DecimalField(max_digits=12, decimal_places=2, help_text='Batch quantity after this movement.')
    reference = models.CharField(max_length=100, blank=True, help_text='e.g. PUR-12, SALE-45')
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']
        constraints = [models.CheckConstraint(condition=Q(quantity__gt=0), name='stock_movement_quantity_gt_0')]

    def __str__(self):
        return f'{self.movement_type} {self.quantity} of {self.product.sku}'
