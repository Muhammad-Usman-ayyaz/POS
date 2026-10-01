from django.db.models import Q
from rest_framework.exceptions import ValidationError
from rest_framework.viewsets import ModelViewSet

from apps.accounts.models import UserRole
from apps.core.permissions import roles_permission

from .models import SalesReturn
from .serializers import SalesReturnSerializer

CAN_RETURN = (UserRole.OWNER, UserRole.MANAGER, UserRole.SALESMAN)


class SalesReturnViewSet(ModelViewSet):
    serializer_class = SalesReturnSerializer
    permission_classes = [roles_permission(*CAN_RETURN)]

    def get_queryset(self):
        qs = SalesReturn.objects.select_related('sale', 'sale__customer', 'created_by') \
            .prefetch_related('items__sale_item__product')
        params = self.request.query_params
        if params.get('sale', '').isdigit():
            qs = qs.filter(sale_id=int(params['sale']))
        search = params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(id__icontains=search) | Q(sale__id__icontains=search) | Q(sale__customer__name__icontains=search)
            )
        return qs

    def perform_destroy(self, instance):
        raise ValidationError({'detail': 'Returns cannot be deleted — they are an append-only record.'})
