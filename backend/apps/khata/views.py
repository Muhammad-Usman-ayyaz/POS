from django.core.paginator import Paginator
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import KhataCharge, KhataPayment
from .serializers import build_ledger_rows


class KhataLedgerView(APIView):
    """
    Shop-wide khata ledger (every customer's charges + payments), for the Khata and Payments
    pages. Two models merged in Python rather than a SQL UNION, since they don't share a
    schema — fine at this scale; move to a real ledger table if this ever needs to scale up.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = request.query_params
        entry_type = params.get('type')  # 'CHARGE' | 'PAYMENT' | None (both)
        search = params.get('search', '').strip()
        customer_id = params.get('customer')

        charges = KhataCharge.objects.select_related('customer', 'created_by')
        payments = KhataPayment.objects.select_related('customer', 'created_by')
        if customer_id and customer_id.isdigit():
            charges = charges.filter(customer_id=customer_id)
            payments = payments.filter(customer_id=customer_id)
        if search:
            charges = charges.filter(customer__name__icontains=search)
            payments = payments.filter(customer__name__icontains=search)
        if entry_type == 'CHARGE':
            payments = payments.none()
        elif entry_type == 'PAYMENT':
            charges = charges.none()

        rows = build_ledger_rows(charges, payments)

        page_size = min(int(params.get('page_size', 25) or 25), 100)
        paginator = Paginator(rows, page_size)
        page_number = int(params.get('page', 1) or 1)
        page = paginator.get_page(page_number)
        return Response({
            'count': paginator.count,
            'next': page.next_page_number() if page.has_next() else None,
            'previous': page.previous_page_number() if page.has_previous() else None,
            'results': list(page.object_list),
        })
