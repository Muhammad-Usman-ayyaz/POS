from django.conf import settings
from django.db import models


class PaymentMethod(models.TextChoices):
    CASH = 'CASH', 'Cash'
    BANK_TRANSFER = 'BANK_TRANSFER', 'Bank Transfer'
    EASYPAISA = 'EASYPAISA', 'Easypaisa'
    ADJUSTMENT = 'ADJUSTMENT', 'Return Credit'
    JAZZCASH = 'JAZZCASH', 'JazzCash'


class KhataCharge(models.Model):
    """
    A credit sale posted to a customer's khata, increasing what they owe. Recorded manually
    here for now; once POS/Sales exists it will post charges through the same model.
    Immutable once created — a mistake is corrected with an offsetting entry, not an edit,
    so the ledger stays a trustworthy audit trail (same rule as Purchases).
    """

    customer = models.ForeignKey('customers.Customer', on_delete=models.PROTECT, related_name='charges')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    description = models.CharField(max_length=255, blank=True)
    charge_date = models.DateField()
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-charge_date', '-id']
        constraints = [models.CheckConstraint(condition=models.Q(amount__gt=0), name='khata_charge_amount_gt_0')]

    def __str__(self):
        return f'Charge Rs. {self.amount} to {self.customer.name}'


class KhataPayment(models.Model):
    """A payment against a customer's running khata balance (not tied to one specific charge)."""

    customer = models.ForeignKey('customers.Customer', on_delete=models.PROTECT, related_name='payments')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    method = models.CharField(max_length=20, choices=PaymentMethod.choices, default=PaymentMethod.CASH)
    paid_on = models.DateField()
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-paid_on', '-id']
        constraints = [models.CheckConstraint(condition=models.Q(amount__gt=0), name='khata_payment_amount_gt_0')]

    def __str__(self):
        return f'Payment Rs. {self.amount} from {self.customer.name}'
