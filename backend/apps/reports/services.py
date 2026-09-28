from datetime import timedelta
from decimal import Decimal

from django.db.models import DecimalField, F, OuterRef, Subquery, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.catalog.models import Batch
from apps.customers.models import Customer
from apps.khata.models import KhataCharge, KhataPayment
from apps.purchases.models import Purchase, PurchaseItem, SupplierPayment
from apps.sales.models import Sale, SaleItem

MONEY = DecimalField(max_digits=14, decimal_places=2)
ZERO = Decimal('0')


def _sum(queryset, expr):
    return queryset.aggregate(total=Coalesce(Sum(expr, output_field=MONEY), ZERO))['total']


def dashboard_summary():
    today = timezone.localdate()

    todays_sales = Sale.objects.filter(sale_date=today, status=Sale.Status.COMPLETED)
    today_sales_lines = _sum(SaleItem.objects.filter(sale__in=todays_sales), F('quantity') * F('unit_price'))
    today_sales_discount = _sum(todays_sales, 'discount_amount')
    today_sales_total = today_sales_lines - today_sales_discount

    todays_purchases = Purchase.objects.filter(purchase_date=today).exclude(status=Purchase.Status.CANCELLED)
    today_purchases_total = _sum(PurchaseItem.objects.filter(purchase__in=todays_purchases), F('quantity') * F('unit_cost'))

    khata_charges_total = _sum(KhataCharge.objects.all(), 'amount')
    khata_payments_total = _sum(KhataPayment.objects.all(), 'amount')
    khata_outstanding_total = khata_charges_total - khata_payments_total

    charged_sq = KhataCharge.objects.filter(customer=OuterRef('pk')).values('customer').annotate(t=Sum('amount')).values('t')
    paid_sq = KhataPayment.objects.filter(customer=OuterRef('pk')).values('customer').annotate(t=Sum('amount')).values('t')
    khata_outstanding_customers = Customer.objects.annotate(
        charged=Coalesce(Subquery(charged_sq, output_field=MONEY), ZERO),
        paid=Coalesce(Subquery(paid_sq, output_field=MONEY), ZERO),
    ).filter(charged__gt=F('paid')).count()

    active_purchases = Purchase.objects.exclude(status=Purchase.Status.CANCELLED)
    purchases_total = _sum(PurchaseItem.objects.filter(purchase__in=active_purchases), F('quantity') * F('unit_cost'))
    payments_total = _sum(SupplierPayment.objects.filter(purchase__in=active_purchases), 'amount')
    supplier_payables_total = purchases_total - payments_total

    low_stock_count = (
        Batch.objects.filter(quantity__gt=0, quantity__lte=F('product__min_stock_level'), product__is_deleted=False)
        .values('product').distinct().count()
    )
    expiring_soon_count = Batch.objects.filter(
        quantity__gt=0, expiry_date__gte=today, expiry_date__lte=today + timedelta(days=60), product__is_deleted=False,
    ).count()

    recent = Sale.objects.select_related('customer').prefetch_related('items').order_by('-created_at')[:5]
    recent_sales = [
        {
            'id': s.id, 'invoice_no': s.invoice_no, 'customer_name': s.customer.name if s.customer else 'Walk-in Customer',
            'total_amount': str(s.total_amount), 'sale_date': s.sale_date, 'payment_method': s.payment_method, 'status': s.status,
        }
        for s in recent
    ]

    return {
        'today_sales_total': str(today_sales_total), 'today_sales_count': todays_sales.count(),
        'today_purchases_total': str(today_purchases_total), 'today_purchases_count': todays_purchases.count(),
        'khata_outstanding_total': str(khata_outstanding_total), 'khata_outstanding_customers': khata_outstanding_customers,
        'supplier_payables_total': str(supplier_payables_total),
        'low_stock_count': low_stock_count, 'expiring_soon_count': expiring_soon_count,
        'recent_sales': recent_sales,
    }


def sales_trend(days: int):
    today = timezone.localdate()
    start = today - timedelta(days=days - 1)
    rows = (
        SaleItem.objects.filter(sale__sale_date__range=(start, today), sale__status=Sale.Status.COMPLETED)
        .values('sale__sale_date').annotate(lines=Sum(F('quantity') * F('unit_price'), output_field=MONEY))
    )
    discounts = (
        Sale.objects.filter(sale_date__range=(start, today), status=Sale.Status.COMPLETED)
        .values('sale_date').annotate(discount=Sum('discount_amount', output_field=MONEY))
    )
    lines_by_date = {r['sale__sale_date']: r['lines'] for r in rows}
    discount_by_date = {r['sale_date']: r['discount'] for r in discounts}

    result = []
    for i in range(days):
        d = start + timedelta(days=i)
        total = lines_by_date.get(d, ZERO) - discount_by_date.get(d, ZERO)
        result.append({'date': d.isoformat(), 'total': str(total)})
    return result


def sales_by_category(days: int):
    today = timezone.localdate()
    start = today - timedelta(days=days - 1)
    rows = (
        SaleItem.objects.filter(sale__sale_date__range=(start, today), sale__status=Sale.Status.COMPLETED)
        .values('product__category__name').annotate(total=Sum(F('quantity') * F('unit_price'), output_field=MONEY))
        .order_by('-total')
    )
    return [{'category': r['product__category__name'] or 'Uncategorised', 'total': str(r['total'])} for r in rows]


def top_products(days: int, limit: int):
    today = timezone.localdate()
    start = today - timedelta(days=days - 1)
    rows = (
        SaleItem.objects.filter(sale__sale_date__range=(start, today), sale__status=Sale.Status.COMPLETED)
        .values('product__id', 'product__name', 'product__sku', 'product__category__name')
        .annotate(total_quantity=Sum('quantity'), revenue=Sum(F('quantity') * F('unit_price'), output_field=MONEY))
        .order_by('-revenue')[:limit]
    )
    return [
        {'product': r['product__id'], 'product_name': r['product__name'], 'sku': r['product__sku'],
         'category_name': r['product__category__name'], 'quantity': str(r['total_quantity']), 'revenue': str(r['revenue'])}
        for r in rows
    ]
