from django.contrib import admin
from django.urls import path, include

from apps.accounts.urls import router as accounts_router

urlpatterns = [
    path('admin/', admin.site.urls),
    # Authentication & Accounts API endpoints
    path('api/auth/', include('apps.accounts.urls')),
    # Employees directory (Owner/Manager only)
    path('api/', include(accounts_router.urls)),
    # Product catalog: categories, brands, products
    path('api/catalog/', include('apps.catalog.urls')),
    # Inventory: batch-level stock + movement ledger + adjustments
    path('api/inventory/', include('apps.inventory.urls')),
    # Suppliers directory
    path('api/', include('apps.suppliers.urls')),
    # Purchases: goods received from suppliers
    path('api/', include('apps.purchases.urls')),
    # Farmers & customers directory
    path('api/', include('apps.customers.urls')),
    # Farmer khata: shop-wide credit ledger
    path('api/khata/', include('apps.khata.urls')),
    # Sales: POS transactions, invoices
    path('api/', include('apps.sales.urls')),
    # Reports: dashboard summary, sales trend, category/product analytics
    path('api/reports/', include('apps.reports.urls')),
    # Audit log: who did what, for critical activities (Owner/Manager only)
    path('api/', include('apps.audit.urls')),
]
