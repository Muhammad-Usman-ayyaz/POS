from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    ChangePasswordView,
    CurrentUserView,
    CustomTokenObtainPairView,
    CustomTokenRefreshView,
    EmployeeViewSet,
    LogoutView,
)

# Employees are mounted at the top-level `/api/` prefix (see config/urls.py), not under
# `/api/auth/`, to match every other resource's URL shape (`/api/suppliers/`, `/api/purchases/`, ...).
router = DefaultRouter()
router.register('employees', EmployeeViewSet, basename='employee')

urlpatterns = [
    path('token/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', CustomTokenRefreshView.as_view(), name='token_refresh'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('me/', CurrentUserView.as_view(), name='current_user'),
    path('change-password/', ChangePasswordView.as_view(), name='change_password'),
]
