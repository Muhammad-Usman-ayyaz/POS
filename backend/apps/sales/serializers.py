from decimal import Decimal

from rest_framework import serializers

from apps.catalog.models import Batch, Product

from .models import Sale, SaleItem
from .services import create_sale


class SaleLineInputSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    batch = serializers.PrimaryKeyRelatedField(queryset=Batch.objects.all())
    quantity = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'))

    def validate(self, attrs):
        if attrs['batch'].product_id != attrs['product'].id:
            raise serializers.ValidationError('This batch does not belong to the selected product.')
        return attrs


class SaleItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    sku = serializers.CharField(source='product.sku', read_only=True)
    batch_no = serializers.CharField(source='batch.batch_no', read_only=True)
    line_total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = SaleItem
        fields = ['id', 'product', 'product_name', 'sku', 'batch', 'batch_no', 'quantity', 'unit_price', 'line_total']
        read_only_fields = fields


class SaleSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.name', read_only=True, default=None)
    invoice_no = serializers.CharField(read_only=True)
    items = SaleItemSerializer(many=True, read_only=True)
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    balance = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    created_by_name = serializers.CharField(source='created_by.name', read_only=True, default=None)

    # Optional on create: how much was paid now. Omitted means "pay the full total" (the ordinary
    # case); a lower amount splits the rest to khata credit. Declared explicitly (rather than left
    # to ModelSerializer's auto-mapping) so omitting it doesn't fall back to the model's `default=0`.
    paid_amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'), required=False)

    # Write-only: the lines to sell. Required on create; sales don't edit lines afterwards.
    lines = SaleLineInputSerializer(many=True, write_only=True, required=False)

    class Meta:
        model = Sale
        fields = [
            'id', 'invoice_no', 'customer', 'customer_name', 'sale_date', 'payment_method',
            'discount_amount', 'paid_amount', 'balance', 'status', 'notes', 'items', 'lines',
            'subtotal', 'total_amount', 'created_by_name', 'created_at',
        ]
        read_only_fields = ['id', 'status', 'created_at']

    def validate(self, attrs):
        if self.instance is None and not attrs.get('lines'):
            raise serializers.ValidationError({'lines': 'At least one item is required.'})
        return attrs

    def create(self, validated_data):
        lines = validated_data.pop('lines')
        request = self.context.get('request')
        return create_sale(
            customer=validated_data.get('customer'),
            sale_date=validated_data['sale_date'],
            payment_method=validated_data.get('payment_method', 'CASH'),
            discount_amount=validated_data.get('discount_amount', 0),
            paid_amount=validated_data.get('paid_amount'),
            notes=validated_data.get('notes', ''),
            lines=lines,
            user=getattr(request, 'user', None),
        )
