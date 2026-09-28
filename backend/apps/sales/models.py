from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import Q


class SalePaymentMethod(models.TextChoices):
    CASH = 'CASH', 'Cash'
    BANK_TRANSFER = 'BANK_TRANSFER', 'Bank Transfer'
    EASYPAISA = 'EASYPAISA', 'Easypaisa'
    JAZZCASH = 'JAZZCASH', 'JazzCash'
    KHATA = 'KHATA', 'Khata (Credit)'


class Sale(models.Model):
    """
    A completed till transaction. Immutable once made, same as Purchases: mistakes are corrected
    with `cancel`, which reverses the stock it took out (and deletes the khata charge it posted,
    if any) rather than editing history.

    A KHATA sale requires a customer and posts the full total as one KhataCharge — the same model
    the manual "Record credit sale" flow uses, so a farmer's ledger reads as one continuous history
    whether the charge came from the counter or from POS.
    """

    class Status(models.TextChoices):
        COMPLETED = 'COMPLETED', 'Completed'
        CANCELLED = 'CANCELLED', 'Cancelled'

    customer = models.ForeignKey(
        'customers.Customer', null=True, blank=True, on_delete=models.PROTECT, related_name='sales'
    )
    sale_date = models.DateField()
    payment_method = models.CharField(max_length=20, choices=SalePaymentMethod.choices, default=SalePaymentMethod.CASH)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.COMPLETED)
    notes = models.CharField(max_length=255, blank=True)
    # Set only for KHATA sales; nulled out (not followed) once cancel() has deleted the charge.
    khata_charge = models.ForeignKey(
        'khata.KhataCharge', null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-sale_date', '-id']
        constraints = [models.CheckConstraint(condition=Q(discount_amount__gte=0), name='sale_discount_amount_gte_0')]

    def __str__(self):
        return f'INV-{self.pk} ({self.status})'

    @property
    def invoice_no(self):
        return f'INV-{self.pk}'

    @property
    def subtotal(self):
        return sum((item.line_total for item in self.items.all()), start=Decimal('0'))

    @property
    def total_amount(self):
        return self.subtotal - self.discount_amount


class SaleItem(models.Model):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey('catalog.Product', on_delete=models.PROTECT, related_name='sale_items')
    batch = models.ForeignKey('catalog.Batch', on_delete=models.PROTECT, related_name='sale_items')
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(quantity__gt=0), name='sale_item_quantity_gt_0'),
            models.CheckConstraint(condition=Q(unit_price__gte=0), name='sale_item_unit_price_gte_0'),
        ]

    @property
    def line_total(self):
        return self.quantity * self.unit_price

    def __str__(self):
        return f'{self.product.sku} x{self.quantity} @ {self.unit_price}'
