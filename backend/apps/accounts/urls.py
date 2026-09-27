from django.urls import path
from .views import (
    CustomTokenObtainPairView,
    CustomTokenRefreshView,
    CurrentUserView,
    LogoutView,
)

urlpatterns = [
    path('token/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', CustomTokenRefreshView.as_view(), name='token_refresh'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('me/', CurrentUserView.as_view(), name='current_user'),
]
