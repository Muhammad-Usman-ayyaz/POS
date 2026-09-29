from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import UserRole
from apps.core.permissions import roles_permission

from . import services

BACK_OFFICE = (UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)


def _int_param(request, name, default, minimum=1, maximum=365):
    raw = request.query_params.get(name)
    try:
        value = int(raw) if raw else default
    except ValueError:
        value = default
    return max(minimum, min(maximum, value))


class DashboardSummaryView(APIView):
    """Today's headline numbers for the Dashboard. Visible to every signed-in role."""

    permission_classes = [roles_permission()]

    def get(self, request):
        return Response(services.dashboard_summary())


class SalesTrendView(APIView):
    """Daily sales totals for the trend chart. Visible to every signed-in role."""

    permission_classes = [roles_permission()]

    def get(self, request):
        days = _int_param(request, 'days', 14, minimum=7, maximum=90)
        return Response(services.sales_trend(days))


class SalesByCategoryView(APIView):
    """Back-office only: revenue split by product category, for the Reports page."""

    permission_classes = [roles_permission(*BACK_OFFICE, read_roles=BACK_OFFICE)]

    def get(self, request):
        days = _int_param(request, 'days', 30, minimum=7, maximum=365)
        return Response(services.sales_by_category(days))


class TopProductsView(APIView):
    """Back-office only: best-selling products by revenue, for the Reports page."""

    permission_classes = [roles_permission(*BACK_OFFICE, read_roles=BACK_OFFICE)]

    def get(self, request):
        days = _int_param(request, 'days', 30, minimum=7, maximum=365)
        limit = _int_param(request, 'limit', 10, minimum=1, maximum=50)
        return Response(services.top_products(days, limit))


class ProfitAnalysisView(APIView):
    """Back-office only: revenue, cost of goods sold, profit, and margin over a period."""

    permission_classes = [roles_permission(*BACK_OFFICE, read_roles=BACK_OFFICE)]

    def get(self, request):
        days = _int_param(request, 'days', 30, minimum=7, maximum=365)
        return Response(services.profit_analysis(days))


class PurchaseTrendView(APIView):
    """Back-office only: daily purchase spend, for the Reports page."""

    permission_classes = [roles_permission(*BACK_OFFICE, read_roles=BACK_OFFICE)]

    def get(self, request):
        days = _int_param(request, 'days', 30, minimum=7, maximum=365)
        return Response(services.purchase_trend(days))


class PurchasesBySupplierView(APIView):
    """Back-office only: purchase spend grouped by supplier, for the Reports page."""

    permission_classes = [roles_permission(*BACK_OFFICE, read_roles=BACK_OFFICE)]

    def get(self, request):
        days = _int_param(request, 'days', 30, minimum=7, maximum=365)
        limit = _int_param(request, 'limit', 10, minimum=1, maximum=50)
        return Response(services.purchases_by_supplier(days, limit))
