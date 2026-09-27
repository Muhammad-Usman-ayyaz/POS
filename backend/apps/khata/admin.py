from django.contrib import admin

from .models import KhataCharge, KhataPayment


class ReadOnlyLedgerAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(KhataCharge)
class KhataChargeAdmin(ReadOnlyLedgerAdmin):
    list_display = ('customer', 'amount', 'charge_date', 'created_by')
    search_fields = ('customer__name',)
    readonly_fields = [f.name for f in KhataCharge._meta.fields]


@admin.register(KhataPayment)
class KhataPaymentAdmin(ReadOnlyLedgerAdmin):
    list_display = ('customer', 'amount', 'method', 'paid_on', 'created_by')
    list_filter = ('method',)
    search_fields = ('customer__name',)
    readonly_fields = [f.name for f in KhataPayment._meta.fields]
