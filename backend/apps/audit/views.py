from rest_framework.viewsets import ReadOnlyModelViewSet

from apps.accounts.models import UserRole
from apps.core.permissions import roles_permission

from .models import AuditLog
from .serializers import AuditLogSerializer

MANAGEMENT = (UserRole.OWNER, UserRole.MANAGER)


class AuditLogViewSet(ReadOnlyModelViewSet):
    """Owner/Manager only. Read-only by design — audit entries are written by the service layer,
    never through this API, so the log itself can't be tampered with from the client."""

    serializer_class = AuditLogSerializer
    permission_classes = [roles_permission(*MANAGEMENT, read_roles=MANAGEMENT)]

    def get_queryset(self):
        qs = AuditLog.objects.all()
        params = self.request.query_params
        if params.get('action'):
            qs = qs.filter(action=params['action'])
        search = params.get('search', '').strip()
        if search:
            qs = qs.filter(summary__icontains=search)
        return qs
