from django.db import models

from apps.core.models import SoftDeleteModel


class Customer(SoftDeleteModel):
    """A farmer or walk-in customer who can buy on credit (Khata)."""

    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=30, blank=True)
    cnic = models.CharField('CNIC', max_length=20, blank=True)
    village = models.CharField(max_length=150, blank=True)
    address = models.CharField(max_length=255, blank=True)
    credit_limit = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['name']
        constraints = [
            models.CheckConstraint(condition=models.Q(credit_limit__gte=0), name='customer_credit_limit_gte_0'),
        ]

    def __str__(self):
        return self.name
