from django.urls import path

from .views import DashboardSummaryView, SalesByCategoryView, SalesTrendView, TopProductsView

urlpatterns = [
    path('dashboard-summary/', DashboardSummaryView.as_view(), name='dashboard-summary'),
    path('sales-trend/', SalesTrendView.as_view(), name='sales-trend'),
    path('sales-by-category/', SalesByCategoryView.as_view(), name='sales-by-category'),
    path('top-products/', TopProductsView.as_view(), name='top-products'),
]
