from django.contrib import admin

from .models import Batch, Brand, Category, Product


class SoftDeleteAdmin(admin.ModelAdmin):
    """Admin sees soft-deleted rows too, so they can be inspected and restored."""

    def get_queryset(self, request):
        return self.model.all_objects.all()

    def delete_model(self, request, obj):
        obj.soft_delete(request.user)

    def delete_queryset(self, request, queryset):
        for obj in queryset:
            obj.soft_delete(request.user)


@admin.register(Category)
class CategoryAdmin(SoftDeleteAdmin):
    list_display = ('name', 'is_deleted')
    list_filter = ('is_deleted',)


@admin.register(Brand)
class BrandAdmin(SoftDeleteAdmin):
    list_display = ('name', 'is_deleted')
    list_filter = ('is_deleted',)


class BatchInline(admin.TabularInline):
    model = Batch
    extra = 0


@admin.register(Product)
class ProductAdmin(SoftDeleteAdmin):
    list_display = ('name', 'sku', 'category', 'brand', 'selling_price', 'is_active', 'is_deleted')
    list_filter = ('category', 'brand', 'is_active', 'is_deleted')
    search_fields = ('name', 'sku', 'chemical')
    inlines = [BatchInline]
