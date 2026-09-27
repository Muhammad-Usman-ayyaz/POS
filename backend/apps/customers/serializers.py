from rest_framework import serializers

from .models import Customer


class CustomerSerializer(serializers.ModelSerializer):
    """
    Reads rely on annotations added by CustomerViewSet.get_queryset(): total_charged,
    total_paid and outstanding_balance are computed live from the khata ledger, never stored.
    """

    total_charged = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total_paid = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    outstanding_balance = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    over_credit_limit = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = [
            'id', 'name', 'phone', 'cnic', 'village', 'address', 'credit_limit', 'notes',
            'total_charged', 'total_paid', 'outstanding_balance', 'over_credit_limit',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {'credit_limit': {'min_value': 0}}

    def get_over_credit_limit(self, obj):
        return obj.credit_limit > 0 and obj.outstanding_balance > obj.credit_limit

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Name is required.')
        return value
