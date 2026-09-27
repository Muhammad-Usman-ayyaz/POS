from rest_framework.routers import DefaultRouter
from django.urls import path

from .views import BatchStockViewSet, StockAdjustmentView, StockMovementViewSet

router = DefaultRouter()
router.register('batches', BatchStockViewSet, basename='batch-stock')
router.register('movements', StockMovementViewSet, basename='stock-movement')

urlpatterns = router.urls + [
    path('adjustments/', StockAdjustmentView.as_view(), name='stock-adjustment'),
]
