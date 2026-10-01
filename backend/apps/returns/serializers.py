from decimal import Decimal

from rest_framework import serializers

from apps.sales.models import SaleItem

from .models import RefundMethod, SalesReturn, SalesReturnItem
from .services import create_return


class ReturnLineInputSerializer(serializers.Serializer):
    sale_item = serializers.PrimaryKeyRelatedField(queryset=SaleItem.objects.all())
    quantity = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))


class SalesReturnItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='sale_item.product.name', read_only=True)
    sku = serializers.CharField(source='sale_item.product.sku', read_only=True)
    line_total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = SalesReturnItem
        fields = ['id', 'sale_item', 'product_name', 'sku', 'quantity', 'unit_price', 'line_total']
        read_only_fields = fields


class SalesReturnSerializer(serializers.ModelSerializer):
    return_no = serializers.CharField(read_only=True)
    invoice_no = serializers.CharField(source='sale.invoice_no', read_only=True)
    customer_name = serializers.CharField(source='sale.customer.name', read_only=True, default=None)
    total_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    items = SalesReturnItemSerializer(many=True, read_only=True)
    created_by_name = serializers.CharField(source='created_by.name', read_only=True, default=None)

    # Write-only: the lines to return. Required on create; returns don't edit lines afterwards.
    lines = ReturnLineInputSerializer(many=True, write_only=True, required=False)

    class Meta:
        model = SalesReturn
        fields = [
            'id', 'return_no', 'sale', 'invoice_no', 'customer_name', 'return_date', 'reason',
            'refund_method', 'total_amount', 'items', 'lines', 'created_by_name', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def validate(self, attrs):
        if self.instance is None and not attrs.get('lines'):
            raise serializers.ValidationError({'lines': 'At least one item is required.'})
        return attrs

    def create(self, validated_data):
        lines = validated_data.pop('lines')
        request = self.context.get('request')
        return create_return(
            sale=validated_data['sale'],
            return_date=validated_data['return_date'],
            reason=validated_data.get('reason', ''),
            refund_method=validated_data.get('refund_method', RefundMethod.CASH),
            lines=lines,
            user=getattr(request, 'user', None),
        )
