from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager
from django.utils.translation import gettext_lazy as _


class UserRole(models.TextChoices):
    OWNER = 'OWNER', _('Owner')
    MANAGER = 'MANAGER', _('Manager')
    SALESMAN = 'SALESMAN', _('Salesman')
    ACCOUNTANT = 'ACCOUNTANT', _('Accountant')


class UserManager(BaseUserManager):
    """Manager for custom user model using email as unique identifier."""

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError(_('The Email field must be set.'))
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('role', UserRole.OWNER)
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError(_('Superuser must have is_staff=True.'))
        if extra_fields.get('is_superuser') is not True:
            raise ValueError(_('Superuser must have is_superuser=True.'))

        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser):
    """Custom User model for Pesticide Club Shop ERP.

    Access control is role-based (see UserRole + apps.core.permissions.roles_permission()),
    not Django's groups/permissions framework, so this intentionally skips PermissionsMixin —
    is_superuser is kept as a plain flag solely to gate Django Admin access.
    """

    name = models.CharField(max_length=255)
    email = models.EmailField(unique=True, db_index=True)
    role = models.CharField(
        max_length=20,
        choices=UserRole.choices,
        default=UserRole.SALESMAN,
        db_index=True,
    )
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_superuser = models.BooleanField(
        default=False,
        verbose_name=_('superuser status'),
        help_text=_('Designates that this user has all permissions without explicitly assigning them.'),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['name']

    class Meta:
        verbose_name = _('User')
        verbose_name_plural = _('Users')
        ordering = ['-created_at']

    def has_perm(self, perm, obj=None):
        return self.is_superuser

    def has_perms(self, perm_list, obj=None):
        return self.is_superuser

    def has_module_perms(self, app_label):
        return self.is_superuser

    def __str__(self):
        return f"{self.name} ({self.email}) - {self.role}"
