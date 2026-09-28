from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from apps.audit.services import log_action
from apps.catalog.models import Product
from apps.inventory.models import MovementType
from apps.inventory.services import apply_stock_movement, get_or_create_batch_for_purchase

from .models import Purchase, PurchaseItem, SupplierPayment


class PurchaseItemInputSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    batch_no = serializers.CharField(max_length=60)
    expiry_date = serializers.DateField(required=False, allow_null=True)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
    unit_cost = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'))


class PurchaseItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    sku = serializers.CharField(source='product.sku', read_only=True)
    line_total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = PurchaseItem
        fields = ['id', 'product', 'product_name', 'sku', 'batch_no', 'expiry_date', 'quantity', 'unit_cost', 'line_total']
        read_only_fields = fields


class SupplierPaymentSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.name', read_only=True, default=None)

    class Meta:
        model = SupplierPayment
        fields = ['id', 'purchase', 'amount', 'method', 'paid_on', 'note', 'created_by_name', 'created_at']
        read_only_fields = ['id', 'purchase', 'created_by_name', 'created_at']

    def validate_amount(self, value):
        purchase = self.context['purchase']
        if value > purchase.balance:
            raise serializers.ValidationError(f'Amount exceeds the outstanding balance of {purchase.balance}.')
        return value


class PurchaseSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    items = PurchaseItemSerializer(many=True, read_only=True)
    payments = SupplierPaymentSerializer(many=True, read_only=True)
    total_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    paid_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    balance = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    # Write-only: the lines to receive. Required on create, ignored on update (purchases don't edit lines).
    items_input = PurchaseItemInputSerializer(many=True, write_only=True, required=False)

    class Meta:
        model = Purchase
        fields = [
            'id', 'supplier', 'supplier_name', 'invoice_no', 'purchase_date', 'status', 'notes',
            'items', 'items_input', 'payments', 'total_amount', 'paid_amount', 'balance', 'created_at',
        ]
        read_only_fields = ['id', 'status', 'created_at']

    def validate(self, attrs):
        if self.instance is None:
            items = attrs.get('items_input')
            if not items:
                raise serializers.ValidationError({'items_input': 'At least one line item is required.'})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        items = validated_data.pop('items_input')
        request = self.context.get('request')
        purchase = Purchase.objects.create(created_by=getattr(request, 'user', None), **validated_data)
        for line in items:
            PurchaseItem.objects.create(
                purchase=purchase, product=line['product'], batch_no=line['batch_no'],
                expiry_date=line.get('expiry_date'), quantity=line['quantity'], unit_cost=line['unit_cost'],
            )
            batch = get_or_create_batch_for_purchase(
                product=line['product'], batch_no=line['batch_no'], expiry_date=line.get('expiry_date'),
            )
            apply_stock_movement(
                batch=batch, movement_type=MovementType.PURCHASE_IN, quantity=line['quantity'],
                user=getattr(request, 'user', None), reference=f'PUR-{purchase.pk}',
                note=f'Received from {purchase.supplier.name}',
            )
        log_action(
            actor=getattr(request, 'user', None), action='PURCHASE_RECEIVED', target_type='Purchase', target_id=purchase.pk,
            summary=f'PUR-{purchase.pk} received from {purchase.supplier.name} — Rs. {purchase.total_amount}',
        )
        return purchase

    def update(self, instance, validated_data):
        # Line items and stock movements are immutable once received; only metadata may change.
        # Status changes (cancel) go through the dedicated action, which also reverses stock.
        validated_data.pop('items_input', None)
        validated_data.pop('status', None)
        return super().update(instance, validated_data)
