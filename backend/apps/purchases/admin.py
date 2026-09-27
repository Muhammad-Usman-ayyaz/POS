from django.contrib import admin

from .models import Purchase, PurchaseItem, SupplierPayment


class PurchaseItemInline(admin.TabularInline):
    model = PurchaseItem
    extra = 0


class SupplierPaymentInline(admin.TabularInline):
    model = SupplierPayment
    extra = 0


@admin.register(Purchase)
class PurchaseAdmin(admin.ModelAdmin):
    list_display = ('id', 'supplier', 'purchase_date', 'status', 'invoice_no')
    list_filter = ('status',)
    search_fields = ('invoice_no', 'supplier__name')
    inlines = [PurchaseItemInline, SupplierPaymentInline]
