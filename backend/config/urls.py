from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    # Authentication & Accounts API endpoints
    path('api/auth/', include('apps.accounts.urls')),
    # Product catalog: categories, brands, products
    path('api/catalog/', include('apps.catalog.urls')),
    # Inventory: batch-level stock + movement ledger + adjustments
    path('api/inventory/', include('apps.inventory.urls')),
    # Suppliers directory
    path('api/', include('apps.suppliers.urls')),
    # Purchases: goods received from suppliers
    path('api/', include('apps.purchases.urls')),
]
