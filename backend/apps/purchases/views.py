from django.db import transaction
from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.accounts.models import UserRole
from apps.audit.services import log_action
from apps.core.permissions import roles_permission
from apps.inventory.models import MovementType
from apps.inventory.services import apply_stock_movement

from .models import Purchase
from .serializers import PurchaseSerializer, SupplierPaymentSerializer

BACK_OFFICE = (UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)


class PurchaseViewSet(ModelViewSet):
    serializer_class = PurchaseSerializer
    permission_classes = [roles_permission(*BACK_OFFICE, read_roles=BACK_OFFICE)]

    def get_queryset(self):
        qs = Purchase.objects.select_related('supplier').prefetch_related('items__product', 'payments')
        params = self.request.query_params
        if params.get('supplier', '').isdigit():
            qs = qs.filter(supplier_id=int(params['supplier']))
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        search = params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(invoice_no__icontains=search) | Q(supplier__name__icontains=search))
        return qs

    def perform_destroy(self, instance):
        raise ValidationError({'detail': 'Purchases cannot be deleted. Use "Cancel" to reverse one instead.'})

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def cancel(self, request, pk=None):
        purchase = self.get_object()
        if purchase.status == Purchase.Status.CANCELLED:
            raise ValidationError({'detail': 'This purchase is already cancelled.'})
        if purchase.payments.exists():
            raise ValidationError({'detail': 'Refund or delete the recorded payments before cancelling this purchase.'})

        for item in purchase.items.select_related('product').all():
            batch = item.product.batches.filter(batch_no=item.batch_no).first()
            if batch is None or batch.quantity < item.quantity:
                raise ValidationError({
                    'detail': f'Cannot cancel: stock for "{item.product.name}" (batch {item.batch_no}) has '
                              f'already moved (sold, adjusted, or transferred).'
                })
            apply_stock_movement(
                batch=batch, movement_type=MovementType.PURCHASE_REVERSED, quantity=item.quantity,
                user=request.user, reference=f'PUR-{purchase.pk}', note='Purchase cancelled',
            )
        purchase.status = Purchase.Status.CANCELLED
        purchase.save(update_fields=['status', 'updated_at'])
        log_action(
            actor=request.user, action='PURCHASE_CANCELLED', target_type='Purchase', target_id=purchase.pk,
            summary=f'PUR-{purchase.pk} ({purchase.supplier.name}) cancelled',
        )
        return Response(PurchaseSerializer(purchase).data)

    @action(detail=True, methods=['post'])
    def pay(self, request, pk=None):
        purchase = self.get_object()
        if purchase.status == Purchase.Status.CANCELLED:
            raise ValidationError({'detail': 'Cannot record a payment against a cancelled purchase.'})
        serializer = SupplierPaymentSerializer(data=request.data, context={'purchase': purchase})
        serializer.is_valid(raise_exception=True)
        serializer.save(purchase=purchase, created_by=request.user)
        log_action(
            actor=request.user, action='SUPPLIER_PAYMENT_RECORDED', target_type='Purchase', target_id=purchase.pk,
            summary=f'Rs. {serializer.validated_data["amount"]} paid to {purchase.supplier.name} for PUR-{purchase.pk}',
        )
        # Re-fetch: get_object() prefetched items/payments, and that cache would otherwise hide
        # the payment just created, understating paid_amount/balance in the response.
        purchase = self.get_queryset().get(pk=purchase.pk)
        return Response(PurchaseSerializer(purchase).data, status=status.HTTP_201_CREATED)
