from django.urls import path

from .views import KhataLedgerView

urlpatterns = [
    path('ledger/', KhataLedgerView.as_view(), name='khata-ledger'),
]
