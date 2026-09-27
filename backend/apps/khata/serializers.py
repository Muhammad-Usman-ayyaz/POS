from decimal import Decimal

from rest_framework import serializers

from .models import KhataCharge, KhataPayment, PaymentMethod


class KhataChargeSerializer(serializers.ModelSerializer):
    class Meta:
        model = KhataCharge
        fields = ['id', 'customer', 'amount', 'description', 'charge_date', 'created_at']
        read_only_fields = ['id', 'customer', 'created_at']
        extra_kwargs = {'amount': {'min_value': Decimal('0.01')}}


class KhataPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = KhataPayment
        fields = ['id', 'customer', 'amount', 'method', 'paid_on', 'note', 'created_at']
        read_only_fields = ['id', 'customer', 'created_at']
        extra_kwargs = {'amount': {'min_value': Decimal('0.01')}}

    # No upper bound: unlike a supplier payment (tied to one purchase's balance), a khata
    # payment is against the customer's running balance — paying more than owed is a
    # legitimate advance/credit, not an error.


def _entry(kind, obj, customer=None):
    return {
        'id': f'{kind}-{obj.pk}',
        'type': kind,
        'customer': customer.pk if customer else obj.customer_id,
        'customer_name': customer.name if customer else obj.customer.name,
        'amount': str(obj.amount),
        'date': str(obj.charge_date if kind == 'CHARGE' else obj.paid_on),
        'description': obj.description if kind == 'CHARGE' else '',
        'method': obj.method if kind == 'PAYMENT' else None,
        'method_label': PaymentMethod(obj.method).label if kind == 'PAYMENT' else None,
        'note': obj.note if kind == 'PAYMENT' else '',
        'created_by_name': obj.created_by.name if obj.created_by else None,
        'created_at': obj.created_at.isoformat(),
    }


def build_ledger_rows(charges, payments, customer=None):
    """Merge charges and payments into one list of plain dicts, newest first."""
    rows = [_entry('CHARGE', c, customer) for c in charges] + [_entry('PAYMENT', p, customer) for p in payments]
    rows.sort(key=lambda r: (r['date'], r['created_at']), reverse=True)
    return rows


def serialize_ledger(customer):
    return build_ledger_rows(
        charges=customer.charges.select_related('created_by'),
        payments=customer.payments.select_related('created_by'),
        customer=customer,
    )
