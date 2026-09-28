from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    """
    An append-only record of who did what, for the "critical activities" the proposal's Data
    Security section requires a log of: sales completed/cancelled, purchases received/cancelled,
    supplier payments, khata charges/payments, manual stock adjustments, employee account changes,
    and login attempts. Never updated or deleted through the API — entries are written by the
    service layer only, at the moment the action happens.
    """

    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+')
    # Snapshot of the actor's name/email at the time — survives the user being deactivated or
    # deleted later, so history never reads "None did this".
    actor_name = models.CharField(max_length=255, blank=True)
    action = models.CharField(max_length=50, db_index=True)
    target_type = models.CharField(max_length=50, blank=True)
    target_id = models.CharField(max_length=50, blank=True)
    summary = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'{self.action}: {self.summary}'
