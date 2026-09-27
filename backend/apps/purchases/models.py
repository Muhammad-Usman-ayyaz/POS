from django.conf import settings
from django.db import models
from django.db.models import Q


class PaymentMethod(models.TextChoices):
    CASH = 'CASH', 'Cash'
    BANK_TRANSFER = 'BANK_TRANSFER', 'Bank Transfer'
    EASYPAISA = 'EASYPAISA', 'Easypaisa'
    JAZZCASH = 'JAZZCASH', 'JazzCash'


class Purchase(models.Model):
    """
    A purchase is immutable once received: it is the record of stock that actually entered the
    shop. Mistakes are corrected with `cancel`, which reverses the stock it added, rather than by
    editing history.
    """

    class Status(models.TextChoices):
        RECEIVED = 'RECEIVED', 'Received'
        CANCELLED = 'CANCELLED', 'Cancelled'

    supplier = models.ForeignKey('suppliers.Supplier', on_delete=models.PROTECT)
    invoice_no = models.CharField(max_length=60, blank=True)
    purchase_date = models.DateField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.RECEIVED)
    notes = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-purchase_date', '-id']

    def __str__(self):
        return f'PUR-{self.pk} / {self.supplier.name}'

    @property
    def total_amount(self):
        return sum((item.line_total for item in self.items.all()), start=0)

    @property
    def paid_amount(self):
        return sum((payment.amount for payment in self.payments.all()), start=0)

    @property
    def balance(self):
        return self.total_amount - self.paid_amount


class PurchaseItem(models.Model):
    purchase = models.ForeignKey(Purchase, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey('catalog.Product', on_delete=models.PROTECT, related_name='purchase_items')
    batch_no = models.CharField(max_length=60)
    expiry_date = models.DateField(null=True, blank=True)
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(quantity__gt=0), name='purchase_item_quantity_gt_0'),
            models.CheckConstraint(condition=Q(unit_cost__gte=0), name='purchase_item_unit_cost_gte_0'),
        ]

    @property
    def line_total(self):
        return self.quantity * self.unit_cost

    def __str__(self):
        return f'{self.product.sku} x{self.quantity} @ {self.unit_cost}'


class SupplierPayment(models.Model):
    """A payment against one purchase. A supplier's outstanding balance is derived from these, never stored."""

    purchase = models.ForeignKey(Purchase, on_delete=models.PROTECT, related_name='payments')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    method = models.CharField(max_length=20, choices=PaymentMethod.choices, default=PaymentMethod.CASH)
    paid_on = models.DateField()
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-paid_on', '-id']
        constraints = [models.CheckConstraint(condition=Q(amount__gt=0), name='supplier_payment_amount_gt_0')]

    @property
    def supplier_id(self):
        return self.purchase.supplier_id

    def __str__(self):
        return f'Rs. {self.amount} on PUR-{self.purchase_id}'
