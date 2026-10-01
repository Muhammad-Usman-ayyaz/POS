from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import Q


class RefundMethod(models.TextChoices):
    CASH = 'CASH', 'Cash Refund'
    KHATA_CREDIT = 'KHATA_CREDIT', 'Khata Credit'


class SalesReturn(models.Model):
    """
    A customer bringing back some (or all) items from a completed sale. Unlike Sale.cancel
    (which reverses an entire sale made in error), this is its own append-only record for a real
    after-the-fact event: the original Sale is never edited or deleted — it stays the true record
    of what was sold and for how much. Returned stock goes back into the batch it left from, and
    the return's value is settled as either a cash refund (recorded here only — no ledger entry,
    since no cash account is tracked elsewhere in this app) or a credit against the customer's
    khata balance, posted as a KhataPayment the same way a real payment would be.
    """

    sale = models.ForeignKey('sales.Sale', on_delete=models.PROTECT, related_name='returns')
    return_date = models.DateField()
    reason = models.CharField(max_length=255, blank=True)
    refund_method = models.CharField(max_length=20, choices=RefundMethod.choices, default=RefundMethod.CASH)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-return_date', '-id']

    def __str__(self):
        return f'{self.return_no} for {self.sale.invoice_no}'

    @property
    def return_no(self):
        return f'RET-{self.pk}'

    @property
    def total_amount(self):
        return sum((item.line_total for item in self.items.all()), start=Decimal('0'))


class SalesReturnItem(models.Model):
    sales_return = models.ForeignKey(SalesReturn, on_delete=models.CASCADE, related_name='items')
    sale_item = models.ForeignKey('sales.SaleItem', on_delete=models.PROTECT, related_name='return_items')
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(quantity__gt=0), name='return_item_quantity_gt_0'),
            models.CheckConstraint(condition=Q(unit_price__gte=0), name='return_item_unit_price_gte_0'),
        ]

    @property
    def line_total(self):
        return self.quantity * self.unit_price

    def __str__(self):
        return f'{self.sale_item.product.sku} x{self.quantity}'
