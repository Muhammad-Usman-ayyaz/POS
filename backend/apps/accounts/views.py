from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .serializers import CustomTokenObtainPairSerializer, UserSerializer


class LoginRateThrottle(AnonRateThrottle):
    scope = 'login'


class CustomTokenObtainPairView(TokenObtainPairView):
    """Takes user credentials (email, password) and returns JWT tokens with user info."""
    throttle_classes = [LoginRateThrottle]
    serializer_class = CustomTokenObtainPairSerializer


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
