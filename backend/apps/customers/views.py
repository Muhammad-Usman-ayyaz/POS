from decimal import Decimal

from django.db.models import DecimalField, F, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.audit.services import log_action

from .models import Customer
from .serializers import CustomerSerializer

MONEY = DecimalField(max_digits=20, decimal_places=2)


class CustomerViewSet(ModelViewSet):
    """
    Open to every signed-in role (a Salesman needs this at the counter to check a farmer's
    balance and take a payment) — see frontend/src/features/auth/permissions.ts, which leaves
    '/customers' and '/khata' unrestricted by role for the same reason.
    """

    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Local import: apps.khata has a FK to Customer, so importing it at module scope here
        # would create a circular import between the two apps.
        from apps.khata.models import KhataCharge, KhataPayment

        # Each OuterRef is resolved directly against this Customer queryset (single level) —
        # see the suppliers app for what goes wrong when a subquery like this is nested deeper.
        charged = (
            KhataCharge.objects.filter(customer=OuterRef('pk'))
            .values('customer').annotate(total=Sum('amount', output_field=MONEY)).values('total')
        )
        paid = (
            KhataPayment.objects.filter(customer=OuterRef('pk'))
            .values('customer').annotate(total=Sum('amount', output_field=MONEY)).values('total')
        )
        qs = Customer.objects.annotate(
            total_charged=Coalesce(Subquery(charged, output_field=MONEY), Value(Decimal('0'), output_field=MONEY)),
            total_paid=Coalesce(Subquery(paid, output_field=MONEY), Value(Decimal('0'), output_field=MONEY)),
        ).annotate(outstanding_balance=F('total_charged') - F('total_paid'))

        params = self.request.query_params
        search = params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search) | Q(phone__icontains=search) | Q(cnic__icontains=search) | Q(village__icontains=search)
            )
        if params.get('has_balance') == 'true':
            qs = qs.filter(outstanding_balance__gt=0)
        return qs.order_by('name')

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = serializer.save()
        data = self.get_serializer(self.get_queryset().get(pk=customer.pk)).data
        return Response(data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=kwargs.pop('partial', False))
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(self.get_serializer(self.get_queryset().get(pk=instance.pk)).data)

    def perform_destroy(self, instance):
        from apps.khata.models import KhataCharge, KhataPayment
        from rest_framework.exceptions import ValidationError

        if KhataCharge.objects.filter(customer=instance).exists() or KhataPayment.objects.filter(customer=instance).exists():
            raise ValidationError({'detail': 'This customer has khata history and cannot be deleted.'})
        instance.soft_delete(self.request.user)

    @action(detail=True, methods=['post'])
    def charge(self, request, pk=None):
        """Record a credit sale/charge against this customer's khata (outside of POS)."""
        from apps.khata.serializers import KhataChargeSerializer

        customer = self.get_object()
        serializer = KhataChargeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(customer=customer, created_by=request.user)
        log_action(
            actor=request.user, action='KHATA_CHARGE_RECORDED', target_type='Customer', target_id=customer.pk,
            summary=f'Rs. {serializer.validated_data["amount"]} charged to {customer.name}',
        )
        return Response(self.get_serializer(self.get_queryset().get(pk=customer.pk)).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def pay(self, request, pk=None):
        """Record a payment against this customer's outstanding khata balance."""
        from apps.khata.serializers import KhataPaymentSerializer

        customer = self.get_object()
        fresh = self.get_queryset().get(pk=customer.pk)
        serializer = KhataPaymentSerializer(data=request.data, context={'customer': fresh})
        serializer.is_valid(raise_exception=True)
        serializer.save(customer=customer, created_by=request.user)
        log_action(
            actor=request.user, action='KHATA_PAYMENT_RECORDED', target_type='Customer', target_id=customer.pk,
            summary=f'Rs. {serializer.validated_data["amount"]} paid by {customer.name}',
        )
        return Response(self.get_serializer(self.get_queryset().get(pk=customer.pk)).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def ledger(self, request, pk=None):
        from apps.khata.serializers import serialize_ledger

        customer = self.get_object()
        return Response(serialize_ledger(customer=customer))
