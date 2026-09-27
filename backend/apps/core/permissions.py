from rest_framework.permissions import SAFE_METHODS, BasePermission


def roles_permission(*roles, read_roles=None):
    """
    Build a permission class: users in `read_roles` (default: any signed-in user) may read,
    only `roles` may write. Keeps the role matrix in one place per viewset.
    """
    write_roles = set(roles)

    class RolePermission(BasePermission):
        message = 'Your role does not have permission to perform this action.'

        def has_permission(self, request, view):
            user = request.user
            if not (user and user.is_authenticated):
                return False
            if request.method in SAFE_METHODS:
                return read_roles is None or user.role in read_roles
            return user.role in write_roles

    return RolePermission
