import csv
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import DecimalField, ExpressionWrapper, F, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.accounts.models import UserRole
from apps.core.permissions import roles_permission

from .models import Batch, Brand, Category, Product
from .serializers import BatchSerializer, BrandSerializer, CategorySerializer, ProductSerializer, stock_status_for

CATALOG_WRITERS = (UserRole.OWNER, UserRole.MANAGER)
EXPIRY_WARNING_DAYS = 180
ORDERING_FIELDS = {
    'name', '-name', 'selling_price', '-selling_price', 'purchase_price', '-purchase_price',
    'created_at', '-created_at', 'stock_total', '-stock_total', 'next_expiry', '-next_expiry',
}
MONEY = DecimalField(max_digits=20, decimal_places=2)


class _ReferenceViewSet(viewsets.ModelViewSet):
    """Shared behaviour for Category / Brand: soft delete, blocked while products still use them."""

    permission_classes = [roles_permission(*CATALOG_WRITERS)]
    pagination_class = None
    protected_field = None

    def perform_destroy(self, instance):
        in_use = Product.objects.filter(**{self.protected_field: instance}).exists()
        if in_use:
            raise ValidationError({'detail': 'Still used by products. Reassign or remove them first.'})
        instance.soft_delete(self.request.user)


class CategoryViewSet(_ReferenceViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    protected_field = 'category'


class BrandViewSet(_ReferenceViewSet):
    queryset = Brand.objects.all()
    serializer_class = BrandSerializer
    protected_field = 'brand'


class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    permission_classes = [roles_permission(*CATALOG_WRITERS)]

    # ---- queryset -------------------------------------------------------
    def base_queryset(self):
        next_batch = Batch.objects.filter(product=OuterRef('pk'), quantity__gt=0).order_by(
            F('expiry_date').asc(nulls_last=True), 'id'
        )
        return (
            Product.objects.select_related('category', 'brand')
            .annotate(
                stock_total=Coalesce(Sum('batches__quantity'), Value(Decimal('0')), output_field=MONEY),
                next_expiry=Subquery(next_batch.values('expiry_date')[:1]),
                next_batch_no=Subquery(next_batch.values('batch_no')[:1]),
            )
        )

    def get_queryset(self):
        qs = self.base_queryset()
        if self.action in ('list', 'export'):
            qs = self.apply_filters(qs)
        return qs

    def apply_filters(self, qs):
        params = self.request.query_params
        search = params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search) | Q(chemical__icontains=search)
                | Q(sku__icontains=search) | Q(brand__name__icontains=search)
            )
        for param in ('category', 'brand'):
            value = params.get(param)
            if value and value.isdigit():
                qs = qs.filter(**{f'{param}_id': int(value)})
        stock = params.get('stock_status')
        if stock == 'healthy':
            qs = qs.filter(stock_total__gt=F('min_stock_level'))
        elif stock == 'low':
            qs = qs.filter(stock_total__gt=0, stock_total__lte=F('min_stock_level'))
        elif stock == 'out':
            qs = qs.filter(stock_total__lte=0)
        active = params.get('is_active')
        if active in ('true', 'false'):
            qs = qs.filter(is_active=(active == 'true'))
        ordering = params.get('ordering')
        return qs.order_by(ordering, 'id') if ordering in ORDERING_FIELDS else qs.order_by('-created_at', '-id')

    # ---- write paths: respond with the annotated representation ----------
    def _annotated(self, pk):
        return self.base_queryset().get(pk=pk)

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = serializer.save()
        data = self.get_serializer(self._annotated(product.pk)).data
        return Response(data, status=status.HTTP_201_CREATED)

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=kwargs.pop('partial', False))
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(self.get_serializer(self._annotated(instance.pk)).data)

    def perform_destroy(self, instance):
        instance.soft_delete(self.request.user)

    # ---- extras ---------------------------------------------------------
    @action(detail=True, methods=['get'])
    def batches(self, request, pk=None):
        product = self.get_object()
        return Response(BatchSerializer(product.batches.all(), many=True).data)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        today = timezone.localdate()
        alive_batches = Batch.objects.filter(product__is_deleted=False)
        sees_cost = request.user.role != UserRole.SALESMAN

        stock_qs = self.base_queryset()
        value = alive_batches.aggregate(
            cost=Sum(ExpressionWrapper(F('quantity') * F('product__purchase_price'), output_field=MONEY)),
            retail=Sum(ExpressionWrapper(F('quantity') * F('product__selling_price'), output_field=MONEY)),
        )
        cost = value['cost'] or Decimal('0')
        retail = value['retail'] or Decimal('0')
        expiring = (
            alive_batches.filter(
                quantity__gt=0, expiry_date__gte=today, expiry_date__lte=today + timedelta(days=EXPIRY_WARNING_DAYS)
            ).values('product').distinct().count()
        )
        expired = alive_batches.filter(quantity__gt=0, expiry_date__lt=today).values('product').distinct().count()
        return Response({
            'total_products': stock_qs.count(),
            'stock_value': cost if sees_cost else None,
            'weighted_margin_pct': round((retail - cost) / cost * 100, 1) if sees_cost and cost > 0 else None,
            'low_stock_count': stock_qs.filter(stock_total__gt=0, stock_total__lte=F('min_stock_level')).count(),
            'out_of_stock_count': stock_qs.filter(stock_total__lte=0).count(),
            'expiring_soon_count': expiring,
            'expired_count': expired,
            'expiry_warning_days': EXPIRY_WARNING_DAYS,
        })

    @action(detail=False, methods=['get'])
    def export(self, request):
        """CSV of the current filter (ignores pagination). Cost columns only for non-counter roles."""
        sees_cost = request.user.role != UserRole.SALESMAN
        header = ['Name', 'SKU', 'Category', 'Brand', 'Packaging']
        if sees_cost:
            header.append('Purchase Price')
        header += ['Selling Price', 'Stock', 'Stock Status', 'Next Expiry', 'Batch']

        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="products.csv"'
        writer = csv.writer(response)
        writer.writerow(header)
        for p in self.filter_queryset(self.get_queryset()):
            row = [p.name, p.sku, p.category.name, p.brand.name, p.packaging]
            if sees_cost:
                row.append(p.purchase_price)
            row += [
                p.selling_price, p.stock_total, stock_status_for(p.stock_total, p.min_stock_level),
                p.next_expiry or '', p.next_batch_no or '',
            ]
            writer.writerow([_csv_safe(cell) for cell in row])
        return response


def _csv_safe(value):
    """Stop spreadsheet formula injection from user-entered text."""
    text = '' if value is None else str(value)
    return "'" + text if text[:1] in ('=', '+', '-', '@') else text
