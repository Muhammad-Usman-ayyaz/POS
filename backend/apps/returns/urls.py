from rest_framework.routers import DefaultRouter

from .views import SalesReturnViewSet

router = DefaultRouter()
router.register('returns', SalesReturnViewSet, basename='salesreturn')

urlpatterns = router.urls
