from django.db import models
from django.db.models import Q

from apps.core.models import SoftDeleteModel


class Category(SoftDeleteModel):
    name = models.CharField(max_length=100)

    class Meta:
        verbose_name_plural = 'categories'
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['name'], condition=Q(is_deleted=False), name='uniq_alive_category_name'
            ),
        ]

    def __str__(self):
        return self.name


class Brand(SoftDeleteModel):
    name = models.CharField(max_length=150)

    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['name'], condition=Q(is_deleted=False), name='uniq_alive_brand_name'
            ),
        ]

    def __str__(self):
        return self.name


class Product(SoftDeleteModel):
    name = models.CharField(max_length=200, db_index=True)
    chemical = models.CharField('active ingredients / formulation', max_length=255, blank=True)
    sku = models.CharField(max_length=50)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name='products')
    brand = models.ForeignKey(Brand, on_delete=models.PROTECT, related_name='products')
    distributor = models.CharField(max_length=150, blank=True)
    packaging = models.CharField(max_length=50, blank=True, help_text='e.g. 100ml, 50kg Bag')
    formulation_type = models.CharField(max_length=80, blank=True, help_text='e.g. Liquid SC, Granular')
    stock_unit = models.CharField(max_length=30, default='Units', help_text='How stock is counted: Bottles, Bags')
    purchase_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    selling_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    min_stock_level = models.DecimalField(max_digits=12, decimal_places=2, default=20)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['-created_at', '-id']
        constraints = [
            models.UniqueConstraint(fields=['sku'], condition=Q(is_deleted=False), name='uniq_alive_product_sku'),
            models.CheckConstraint(condition=Q(purchase_price__gte=0), name='product_purchase_price_gte_0'),
            models.CheckConstraint(condition=Q(selling_price__gte=0), name='product_selling_price_gte_0'),
            models.CheckConstraint(condition=Q(min_stock_level__gte=0), name='product_min_stock_gte_0'),
        ]

    def __str__(self):
        return f'{self.name} ({self.sku})'


class Batch(models.Model):
    """A received lot of a product. A product's current stock is the sum of its batch quantities."""

    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='batches')
    batch_no = models.CharField(max_length=60)
    expiry_date = models.DateField(null=True, blank=True)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = 'batches'
        ordering = ['expiry_date', 'id']
        constraints = [
            models.UniqueConstraint(fields=['product', 'batch_no'], name='uniq_product_batch_no'),
            models.CheckConstraint(condition=Q(quantity__gte=0), name='batch_quantity_gte_0'),
        ]

    def __str__(self):
        return f'{self.product.name} / {self.batch_no}'
