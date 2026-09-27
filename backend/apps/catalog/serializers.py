from decimal import Decimal

from rest_framework import serializers

from apps.accounts.models import UserRole

from .models import Batch, Brand, Category, Product


def stock_status_for(stock, min_level):
    if stock <= 0:
        return 'Out of Stock'
    if stock <= min_level:
        return 'Low Stock'
    return 'Healthy'


class _AliveUniqueNameMixin:
    """Names are unique among non-deleted rows only, so a deleted name can be reused."""

    def validate_name(self, value):
        value = value.strip()
        qs = self.Meta.model.objects.filter(name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('This name already exists.')
        return value


class CategorySerializer(_AliveUniqueNameMixin, serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name']


class BrandSerializer(_AliveUniqueNameMixin, serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = ['id', 'name']


class BatchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Batch
        fields = ['id', 'batch_no', 'expiry_date', 'quantity']
        read_only_fields = fields


class ProductSerializer(serializers.ModelSerializer):
    """
    Reads rely on annotations added by ProductViewSet.get_queryset():
    stock_total, next_expiry and next_batch_no.
    Stock itself is read-only here: it only changes through batches / stock movements.
    """

    category_name = serializers.CharField(source='category.name', read_only=True)
    brand_name = serializers.CharField(source='brand.name', read_only=True)
    current_stock = serializers.DecimalField(source='stock_total', max_digits=14, decimal_places=2, read_only=True)
    stock_status = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    margin_pct = serializers.SerializerMethodField()
    expiry_date = serializers.DateField(source='next_expiry', read_only=True)
    batch_no = serializers.CharField(source='next_batch_no', read_only=True)

    # Opening stock, accepted on create only.
    opening_quantity = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal('0'), write_only=True, required=False
    )
    opening_batch_no = serializers.CharField(max_length=60, write_only=True, required=False, allow_blank=True)
    opening_expiry_date = serializers.DateField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'chemical', 'sku',
            'category', 'category_name', 'brand', 'brand_name',
            'distributor', 'packaging', 'formulation_type', 'stock_unit',
            'purchase_price', 'selling_price', 'min_stock_level', 'is_active',
            'current_stock', 'stock_status', 'status', 'margin_pct', 'expiry_date', 'batch_no',
            'opening_quantity', 'opening_batch_no', 'opening_expiry_date',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'purchase_price': {'min_value': Decimal('0')},
            'selling_price': {'min_value': Decimal('0')},
            'min_stock_level': {'min_value': Decimal('0')},
        }

    def get_stock_status(self, obj):
        return stock_status_for(obj.stock_total, obj.min_stock_level)

    def get_status(self, obj):
        if not obj.is_active:
            return 'Inactive'
        return 'Restock Pending' if obj.stock_total <= 0 else 'Active'

    def get_margin_pct(self, obj):
        if obj.purchase_price <= 0:
            return None
        return round((obj.selling_price - obj.purchase_price) / obj.purchase_price * 100, 1)

    def validate_sku(self, value):
        value = value.strip().upper()
        qs = Product.objects.filter(sku=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A product with this SKU already exists.')
        return value

    def validate_name(self, value):
        return value.strip()

    def validate(self, attrs):
        if self.instance is not None and any(k.startswith('opening_') for k in attrs):
            raise serializers.ValidationError('Opening stock can only be set when a product is created.')
        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        # Cost prices are not visible to counter staff.
        if request is not None and getattr(request.user, 'role', None) == UserRole.SALESMAN:
            data['purchase_price'] = None
            data['margin_pct'] = None
        return data

    def create(self, validated_data):
        quantity = validated_data.pop('opening_quantity', Decimal('0'))
        batch_no = validated_data.pop('opening_batch_no', '') or 'OPENING'
        expiry = validated_data.pop('opening_expiry_date', None)
        product = super().create(validated_data)
        if quantity > 0 or expiry:
            Batch.objects.create(product=product, batch_no=batch_no, expiry_date=expiry, quantity=quantity)
        return product
