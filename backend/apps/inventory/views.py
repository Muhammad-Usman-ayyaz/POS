from datetime import timedelta
from decimal import Decimal

from django.db.models import F, Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import UserRole
from apps.audit.services import log_action
from apps.catalog.models import Batch
from apps.core.permissions import roles_permission

from .serializers import AdjustmentInputSerializer, BatchStockSerializer, StockMovementSerializer
from .services import apply_stock_movement

BACK_OFFICE = (UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)
NEAR_EXPIRY_DAYS = 90


class BatchStockViewSet(viewsets.ReadOnlyModelViewSet):
    """Per-batch stock rows for the Inventory page. Visible to every signed-in role."""

    serializer_class = BatchStockSerializer
    permission_classes = [roles_permission()]  # no one may write here; reads open to any authenticated role

    def get_queryset(self):
        qs = Batch.objects.select_related('product', 'product__category', 'product__brand').filter(
            product__is_deleted=False
        )
        params = self.request.query_params
        search = params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(product__name__icontains=search) | Q(product__sku__icontains=search) | Q(batch_no__icontains=search)
            )
        if params.get('category', '').isdigit():
            qs = qs.filter(product__category_id=int(params['category']))
        today = timezone.localdate()
        status_filter = params.get('status')
        if status_filter == 'out':
            qs = qs.filter(quantity__lte=0)
        elif status_filter == 'low':
            qs = qs.filter(quantity__gt=0, quantity__lte=F('product__min_stock_level'))
        elif status_filter == 'near_expiry':
            qs = qs.filter(quantity__gt=0, expiry_date__gte=today, expiry_date__lte=today + timedelta(days=NEAR_EXPIRY_DAYS))
        elif status_filter == 'expired':
            qs = qs.filter(quantity__gt=0, expiry_date__lt=today)
        return qs


class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    """The audit-log ledger. Back-office only."""

    serializer_class = StockMovementSerializer
    permission_classes = [roles_permission(*BACK_OFFICE, read_roles=BACK_OFFICE)]

    def get_queryset(self):
        qs = StockMovementSerializer.Meta.model.objects.select_related('product', 'batch', 'created_by')
        params = self.request.query_params
        if params.get('product', '').isdigit():
            qs = qs.filter(product_id=int(params['product']))
        if params.get('movement_type'):
            qs = qs.filter(movement_type=params['movement_type'])
        search = params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(product__name__icontains=search) | Q(product__sku__icontains=search) | Q(reference__icontains=search))
        return qs


class StockAdjustmentView(APIView):
    """POST a manual stock correction, damage write-off, or expiry write-off."""

    permission_classes = [roles_permission(*BACK_OFFICE, read_roles=BACK_OFFICE)]

    def post(self, request):
        serializer = AdjustmentInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        movement = apply_stock_movement(
            batch=data['batch'],
            movement_type=data['movement_type'],
            quantity=data['quantity'],
            user=request.user,
            note=data.get('note', ''),
        )
        log_action(
            actor=request.user, action='STOCK_ADJUSTED', target_type='Batch', target_id=data['batch'].pk,
            summary=f'{data["movement_type"]}: {data["quantity"]} of {data["batch"].product.name} (batch {data["batch"].batch_no})',
        )
        return Response(StockMovementSerializer(movement).data, status=status.HTTP_201_CREATED)
