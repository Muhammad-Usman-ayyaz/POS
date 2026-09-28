from django.db.models import Q
from django.http import HttpResponse
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.accounts.models import UserRole
from apps.core.permissions import roles_permission

from .models import Sale
from .pdf import render_invoice_pdf
from .serializers import SaleSerializer
from .services import cancel_sale

CAN_SELL = (UserRole.OWNER, UserRole.MANAGER, UserRole.SALESMAN)
CAN_CANCEL = (UserRole.OWNER, UserRole.MANAGER)


class SaleViewSet(ModelViewSet):
    serializer_class = SaleSerializer

    def get_permissions(self):
        if self.action == 'cancel':
            return [roles_permission(*CAN_CANCEL)()]
        # Reads open to any signed-in role (Invoices/Sales History); only the till roles may sell.
        return [roles_permission(*CAN_SELL)()]

    def get_queryset(self):
        qs = Sale.objects.select_related('customer', 'created_by').prefetch_related('items__product', 'items__batch')
        params = self.request.query_params
        if params.get('customer', '').isdigit():
            qs = qs.filter(customer_id=int(params['customer']))
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        if params.get('payment_method'):
            qs = qs.filter(payment_method=params['payment_method'])
        search = params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(id__icontains=search) | Q(customer__name__icontains=search))
        return qs

    def perform_destroy(self, instance):
        raise ValidationError({'detail': 'Sales cannot be deleted. Use "Cancel" to reverse one instead.'})

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        sale = self.get_object()
        cancel_sale(sale=sale, user=request.user)
        sale = self.get_queryset().get(pk=sale.pk)
        return Response(SaleSerializer(sale).data)

    @action(detail=True, methods=['get'])
    def invoice(self, request, pk=None):
        sale = self.get_object()
        pdf_bytes = render_invoice_pdf(sale)
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{sale.invoice_no}.pdf"'
        return response
