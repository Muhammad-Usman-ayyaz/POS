from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    # Authentication & Accounts API endpoints
    path('api/auth/', include('apps.accounts.urls')),
]
