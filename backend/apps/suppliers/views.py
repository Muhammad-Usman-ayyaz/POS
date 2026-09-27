from decimal import Decimal

from django.db.models import Count, DecimalField, F, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.accounts.models import UserRole
from apps.core.permissions import roles_permission

from .models import Supplier
from .serializers import SupplierSerializer

BACK_OFFICE = (UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)
MONEY = DecimalField(max_digits=20, decimal_places=2)


class SupplierViewSet(ModelViewSet):
    serializer_class = SupplierSerializer
    permission_classes = [roles_permission(*BACK_OFFICE, read_roles=BACK_OFFICE)]
    pagination_class = None

    def get_queryset(self):
        # Local import: purchases.Purchase has a FK to Supplier, so importing it at module scope
        # here would create a circular import between the two apps.
        from apps.purchases.models import Purchase, PurchaseItem, SupplierPayment

        # Separate subqueries (not a single annotate with two joined Sums) — joining items and
        # payments in one query fans them out into a cross product and inflates both totals.
        live_purchases = Purchase.objects.filter(supplier=OuterRef('pk')).exclude(status=Purchase.Status.CANCELLED)
        purchased = (
            PurchaseItem.objects.filter(purchase__in=Subquery(live_purchases.values('pk')))
            .values('purchase__supplier')
            .annotate(total=Sum(F('quantity') * F('unit_cost'), output_field=MONEY))
            .values('total')
        )
        paid = (
            SupplierPayment.objects.filter(purchase__in=Subquery(live_purchases.values('pk')))
            .values('purchase__supplier')
            .annotate(total=Sum('amount', output_field=MONEY))
            .values('total')
        )
        qs = Supplier.objects.annotate(
            total_purchased=Coalesce(Subquery(purchased, output_field=MONEY), Value(Decimal('0'), output_field=MONEY)),
            total_paid=Coalesce(Subquery(paid, output_field=MONEY), Value(Decimal('0'), output_field=MONEY)),
            purchase_count=Coalesce(
                Subquery(live_purchases.values('supplier').annotate(c=Count('pk')).values('c')), Value(0)
            ),
        ).annotate(outstanding_balance=F('total_purchased') - F('total_paid'))
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(phone__icontains=search) | Q(contact_person__icontains=search))
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        supplier = serializer.save()
        # Plain instance has no annotations; re-fetch through get_queryset() so the response
        # includes outstanding_balance / total_purchased / purchase_count like every other read.
        data = self.get_serializer(self.get_queryset().get(pk=supplier.pk)).data
        return Response(data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        from apps.purchases.models import Purchase

        if Purchase.objects.filter(supplier=instance).exists():
            raise ValidationError({'detail': 'This supplier has purchase history and cannot be deleted.'})
        instance.soft_delete(self.request.user)
