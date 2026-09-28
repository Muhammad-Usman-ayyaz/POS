from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.audit.services import log_action
from apps.core.permissions import roles_permission

from .models import User, UserRole
from .serializers import ChangePasswordSerializer, CustomTokenObtainPairSerializer, EmployeeSerializer, UserSerializer

MANAGEMENT = (UserRole.OWNER, UserRole.MANAGER)


class LoginRateThrottle(AnonRateThrottle):
    scope = 'login'


class CustomTokenObtainPairView(TokenObtainPairView):
    """Takes user credentials (email, password) and returns JWT tokens with user info."""
    throttle_classes = [LoginRateThrottle]
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        email = str(request.data.get('email', ''))[:255]
        try:
            response = super().post(request, *args, **kwargs)
        except Exception:
            log_action(actor=None, action='LOGIN_FAILED', target_type='User', summary=f'Failed sign-in attempt for {email}')
            raise
        if response.status_code == 200:
            user = User.objects.filter(email__iexact=email).first()
            log_action(actor=user, action='LOGIN_SUCCESS', target_type='User', target_id=user.pk if user else None, summary=f'{email} signed in')
        else:
            log_action(actor=None, action='LOGIN_FAILED', target_type='User', summary=f'Failed sign-in attempt for {email}')
        return response


class CustomTokenRefreshView(TokenRefreshView):
    """Takes a refresh token and returns a new access token."""
    pass


class CurrentUserView(APIView):
    """Returns profile information for the authenticated user."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)


class LogoutView(APIView):
    """Blacklists the supplied refresh token so it can no longer be used."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        refresh = request.data.get('refresh')
        if not refresh:
            return Response({'detail': 'Refresh token is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            token = RefreshToken(refresh)
            if str(token.get('user_id')) != str(request.user.pk):
                return Response({'detail': 'Invalid token.'}, status=status.HTTP_400_BAD_REQUEST)
            token.blacklist()
        except TokenError:
            return Response({'detail': 'Invalid token.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChangePasswordView(APIView):
    """Lets the signed-in user change their own password."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data['new_password'])
        request.user.save(update_fields=['password'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class EmployeeViewSet(ModelViewSet):
    """Owner/Manager-only staff directory. Deactivating replaces deletion — a departed employee's
    name still needs to show up as "created_by" on old sales, purchases, and adjustments."""

    serializer_class = EmployeeSerializer
    permission_classes = [roles_permission(*MANAGEMENT, read_roles=MANAGEMENT)]

    def get_queryset(self):
        qs = User.objects.all()
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(name__icontains=search)
        role = self.request.query_params.get('role')
        if role:
            qs = qs.filter(role=role)
        return qs

    def perform_create(self, serializer):
        employee = serializer.save()
        log_action(
            actor=self.request.user, action='EMPLOYEE_CREATED', target_type='User', target_id=employee.pk,
            summary=f'{employee.name} ({employee.role}) added by {self.request.user.name}',
        )

    def perform_update(self, serializer):
        employee = serializer.save()
        log_action(
            actor=self.request.user, action='EMPLOYEE_UPDATED', target_type='User', target_id=employee.pk,
            summary=f'{employee.name} updated by {self.request.user.name}',
        )

    def destroy(self, request, *args, **kwargs):
        employee = self.get_object()
        if employee.pk == request.user.pk:
            return Response({'detail': 'You cannot deactivate your own account.'}, status=status.HTTP_400_BAD_REQUEST)
        if employee.role == UserRole.OWNER and request.user.role != UserRole.OWNER:
            return Response({'detail': "Only an Owner can deactivate another Owner's account."}, status=status.HTTP_400_BAD_REQUEST)
        employee.is_active = False
        employee.save(update_fields=['is_active'])
        log_action(
            actor=request.user, action='EMPLOYEE_DEACTIVATED', target_type='User', target_id=employee.pk,
            summary=f'{employee.name} deactivated by {request.user.name}',
        )
        return Response(EmployeeSerializer(employee).data)

    @action(detail=True, methods=['post'])
    def reactivate(self, request, pk=None):
        employee = self.get_object()
        employee.is_active = True
        employee.save(update_fields=['is_active'])
        log_action(
            actor=request.user, action='EMPLOYEE_REACTIVATED', target_type='User', target_id=employee.pk,
            summary=f'{employee.name} reactivated by {request.user.name}',
        )
        return Response(EmployeeSerializer(employee).data)
