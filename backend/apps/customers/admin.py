from django.contrib import admin

from .models import Customer


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ('name', 'phone', 'village', 'credit_limit', 'is_deleted')
    list_filter = ('is_deleted',)
    search_fields = ('name', 'phone', 'cnic')

    def get_queryset(self, request):
        return self.model.all_objects.all()

    def delete_model(self, request, obj):
        obj.soft_delete(request.user)
