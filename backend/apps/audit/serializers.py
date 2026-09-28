from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = ['id', 'actor_name', 'action', 'target_type', 'target_id', 'summary', 'created_at']
        read_only_fields = fields

    def get_actor_name(self, obj):
        return obj.actor_name or (obj.actor.name if obj.actor else 'System')
