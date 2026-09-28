from .models import AuditLog


def log_action(*, actor, action: str, summary: str, target_type: str = '', target_id=None):
    """The one path allowed to write an audit entry. `actor` may be None (e.g. a failed login
    attempt against an unknown email) or an unauthenticated request.user — both are recorded
    as a null actor with 'System'/'Unknown' as the name rather than raising."""
    is_authenticated = getattr(actor, 'is_authenticated', False)
    AuditLog.objects.create(
        actor=actor if is_authenticated else None,
        actor_name=getattr(actor, 'name', '') if is_authenticated else '',
        action=action,
        target_type=target_type,
        target_id='' if target_id is None else str(target_id),
        summary=summary,
    )
