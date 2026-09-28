from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User, UserRole


class UserSerializer(serializers.ModelSerializer):
    """Public representation of User."""

    class Meta:
        model = User
        fields = [
            'id',
            'name',
            'email',
            'role',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class EmployeeSerializer(serializers.ModelSerializer):
    """Owner/Manager-facing view of a User, with an optional password to set or reset."""

    password = serializers.CharField(write_only=True, required=False, min_length=8, allow_blank=False)

    class Meta:
        model = User
        fields = ['id', 'name', 'email', 'role', 'is_active', 'password', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate(self, attrs):
        requester = self.context['request'].user
        target_role = attrs.get('role', getattr(self.instance, 'role', None))
        if target_role == UserRole.OWNER and requester.role != UserRole.OWNER:
            raise serializers.ValidationError({'role': 'Only an Owner can grant the Owner role.'})
        if self.instance is not None and self.instance.role == UserRole.OWNER and requester.role != UserRole.OWNER:
            raise serializers.ValidationError({'role': "Only an Owner can edit another Owner's account."})
        if self.instance is not None and self.instance.pk == requester.pk and attrs.get('is_active') is False:
            raise serializers.ValidationError({'is_active': 'You cannot deactivate your own account.'})
        if self.instance is None and 'password' not in attrs:
            raise serializers.ValidationError({'password': 'A password is required for a new employee.'})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_current_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect.')
        return value


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Custom SimpleJWT token obtain pair serializer including role and name in claims."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # Custom claims embedded into JWT
        token['name'] = user.name
        token['email'] = user.email
        token['role'] = user.role
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        # Return user details alongside tokens
        data['user'] = {
            'id': self.user.id,
            'name': self.user.name,
            'email': self.user.email,
            'role': self.user.role,
            'is_active': self.user.is_active,
        }
        return data
