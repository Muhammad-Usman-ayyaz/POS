from decimal import Decimal

from rest_framework import serializers

from apps.accounts.models import UserRole
from apps.catalog.models import Batch

from .models import MovementType, StockMovement

ADJUSTMENT_TYPES = (
    MovementType.ADJUSTMENT_IN, MovementType.ADJUSTMENT_OUT, MovementType.DAMAGED, MovementType.EXPIRED,
)


class BatchStockSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    sku = serializers.CharField(source='product.sku', read_only=True)
    category_name = serializers.CharField(source='product.category.name', read_only=True)
    brand_name = serializers.CharField(source='product.brand.name', read_only=True)
    stock_unit = serializers.CharField(source='product.stock_unit', read_only=True)
    packaging = serializers.CharField(source='product.packaging', read_only=True)
    min_stock_level = serializers.DecimalField(source='product.min_stock_level', max_digits=12, decimal_places=2, read_only=True)
    purchase_price = serializers.SerializerMethodField()
    selling_price = serializers.DecimalField(source='product.selling_price', max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = Batch
        fields = [
            'id', 'product', 'product_name', 'sku', 'category_name', 'brand_name', 'packaging', 'stock_unit',
            'batch_no', 'expiry_date', 'quantity', 'min_stock_level', 'purchase_price', 'selling_price',
        ]

    def get_purchase_price(self, obj):
        request = self.context.get('request')
        if request is not None and getattr(request.user, 'role', None) == UserRole.SALESMAN:
            return None
        return obj.product.purchase_price


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    sku = serializers.CharField(source='product.sku', read_only=True)
    batch_no = serializers.CharField(source='batch.batch_no', read_only=True)
    created_by_name = serializers.CharField(source='created_by.name', read_only=True, default=None)

    class Meta:
        model = StockMovement
        fields = [
            'id', 'product', 'product_name', 'sku', 'batch', 'batch_no', 'movement_type',
            'quantity', 'balance_after', 'reference', 'note', 'created_by_name', 'created_at',
        ]
        read_only_fields = fields


class AdjustmentInputSerializer(serializers.Serializer):
    batch = serializers.PrimaryKeyRelatedField(queryset=Batch.objects.select_related('product'))
    movement_type = serializers.ChoiceField(choices=[(t.value, t.label) for t in ADJUSTMENT_TYPES])
    quantity = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
    note = serializers.CharField(max_length=255, required=False, allow_blank=True)
