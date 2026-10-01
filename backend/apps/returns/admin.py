from django.contrib import admin

from .models import SalesReturn, SalesReturnItem


class ReadOnlyLedgerAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class SalesReturnItemInline(admin.TabularInline):
    model = SalesReturnItem
    extra = 0
    readonly_fields = [f.name for f in SalesReturnItem._meta.fields]
    can_delete = False


@admin.register(SalesReturn)
class SalesReturnAdmin(ReadOnlyLedgerAdmin):
    list_display = ('return_no', 'sale', 'refund_method', 'return_date', 'created_by')
    list_filter = ('refund_method',)
    search_fields = ('sale__id', 'sale__customer__name')
    readonly_fields = [f.name for f in SalesReturn._meta.fields]
    inlines = [SalesReturnItemInline]
