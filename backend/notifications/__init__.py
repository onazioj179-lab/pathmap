"""
PATHMAP - Notifications Package
===============================
Email and push notification services.
"""

from .email_service import (
    email_service,
    EmailService,
    EmailTemplate,
    send_welcome_email,
    send_password_reset_email,
    send_geofence_notification,
    send_security_notification,
)

__all__ = [
    "email_service",
    "EmailService",
    "EmailTemplate",
    "send_welcome_email",
    "send_password_reset_email",
    "send_geofence_notification",
    "send_security_notification",
]
