"""
PATHMAP - Email Notification Service
====================================
SendGrid integration for email notifications.
"""
# pyright: reportMissingImports=false

import os
import logging
from typing import List, Dict, Any
from datetime import datetime
from enum import Enum

try:
    from sendgrid import SendGridAPIClient  # type: ignore[import-not-found]
    from sendgrid.helpers.mail import (  # type: ignore[import-not-found]
        Mail, Email, To, Content,
    )
    HAS_SENDGRID = True
except ImportError:
    HAS_SENDGRID = False
    # Stub classes for type hints when SendGrid not installed
    Mail = Any  # type: ignore
    Email = Any  # type: ignore
    To = Any  # type: ignore
    Content = Any  # type: ignore

logger = logging.getLogger(__name__)


# ============== CONFIGURATION ==============

SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@pathmap.com")
FROM_NAME = os.getenv("FROM_NAME", "PathMap")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")


# ============== EMAIL TEMPLATES ==============

class EmailTemplate(str, Enum):
    """Email template IDs."""
    WELCOME = "d-welcome"
    PASSWORD_RESET = "d-password-reset"
    EMAIL_VERIFICATION = "d-email-verify"
    GEOFENCE_ALERT = "d-geofence-alert"
    DEVICE_ADDED = "d-device-added"
    SECURITY_ALERT = "d-security-alert"
    WEEKLY_REPORT = "d-weekly-report"


# ============== DEFAULT TEMPLATES ==============

DEFAULT_TEMPLATES = {
    EmailTemplate.WELCOME: {
        "subject": "Welcome to PathMap",
        "html": """
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #1a1a2e; padding: 20px; text-align: center;">
                <h1 style="color: #00d9ff; margin: 0;">PathMap</h1>
            </div>
            <div style="padding: 30px; background: #f5f5f5;">
                <h2>Welcome, {{username}}!</h2>
                <p>Thanks for joining PathMap. You're now ready to explore with confidence.</p>
                <div style="margin: 20px 0;">
                    <a href="{{app_url}}" style="background: #00d9ff; color: #1a1a2e; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        Open PathMap
                    </a>
                </div>
                <p>Here's what you can do:</p>
                <ul>
                    <li>Navigate with 3D maps</li>
                    <li>Track your devices in real-time</li>
                    <li>Set up geofence alerts</li>
                    <li>Keep your family safe</li>
                </ul>
            </div>
            <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
                <p>PathMap. All rights reserved.</p>
            </div>
        </body>
        </html>
        """
    },
    EmailTemplate.PASSWORD_RESET: {
        "subject": "Reset Your PathMap Password",
        "html": """
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #1a1a2e; padding: 20px; text-align: center;">
                <h1 style="color: #00d9ff; margin: 0;">PathMap</h1>
            </div>
            <div style="padding: 30px; background: #f5f5f5;">
                <h2>Password Reset Request</h2>
                <p>We received a request to reset your password. Click the button below to set a new password:</p>
                <div style="margin: 20px 0;">
                    <a href="{{reset_url}}" style="background: #00d9ff; color: #1a1a2e; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        Reset Password
                    </a>
                </div>
                <p style="color: #666; font-size: 14px;">This link expires in 1 hour.</p>
                <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
            </div>
        </body>
        </html>
        """
    },
    EmailTemplate.GEOFENCE_ALERT: {
        "subject": "Geofence Alert: {{device_name}} {{event_type}} {{geofence_name}}",
        "html": """
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #1a1a2e; padding: 20px; text-align: center;">
                <h1 style="color: #00d9ff; margin: 0;">PathMap Alert</h1>
            </div>
            <div style="padding: 30px; background: #f5f5f5;">
                <h2 style="color: {{alert_color}};">{{device_name}} {{event_type}} {{geofence_name}}</h2>
                <p><strong>Time:</strong> {{timestamp}}</p>
                <p><strong>Location:</strong> {{location}}</p>
                <div style="margin: 20px 0;">
                    <a href="{{app_url}}/tracking" style="background: #00d9ff; color: #1a1a2e; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        View on Map
                    </a>
                </div>
            </div>
        </body>
        </html>
        """
    },
    EmailTemplate.SECURITY_ALERT: {
        "subject": "Security Alert: {{alert_title}}",
        "html": """
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #ff4444; padding: 20px; text-align: center;">
                <h1 style="color: white; margin: 0;">Security Alert</h1>
            </div>
            <div style="padding: 30px; background: #f5f5f5;">
                <h2>{{alert_title}}</h2>
                <p>{{alert_message}}</p>
                <p><strong>Time:</strong> {{timestamp}}</p>
                <p><strong>IP Address:</strong> {{ip_address}}</p>
                <p><strong>Device:</strong> {{device_info}}</p>
                <div style="margin: 20px 0;">
                    <a href="{{app_url}}/security" style="background: #ff4444; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        Review Activity
                    </a>
                </div>
                <p style="color: #666; font-size: 14px;">If this wasn't you, please secure your account immediately.</p>
            </div>
        </body>
        </html>
        """
    },
}


# ============== EMAIL SERVICE ==============

class EmailService:
    """Email notification service."""
    
    def __init__(self):
        self.enabled = bool(SENDGRID_API_KEY) and HAS_SENDGRID
        self.client = None
        
        if self.enabled:
            self.client = SendGridAPIClient(SENDGRID_API_KEY)
            logger.info("Email service initialized with SendGrid")
        else:
            logger.warning("Email service disabled (SendGrid not configured)")
    
    def _build_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        template_data: Dict[str, Any] = None
    ) -> Mail:
        """Build email message."""
        # Replace template variables
        if template_data:
            for key, value in template_data.items():
                html_content = html_content.replace(f"{{{{{key}}}}}", str(value))
                subject = subject.replace(f"{{{{{key}}}}}", str(value))
        
        message = Mail(
            from_email=Email(FROM_EMAIL, FROM_NAME),
            to_emails=To(to_email),
            subject=subject,
            html_content=Content("text/html", html_content)
        )
        
        return message
    
    async def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        template_data: Dict[str, Any] = None
    ) -> bool:
        """Send email."""
        if not self.enabled:
            logger.debug(f"Email disabled, would send to {to_email}: {subject}")
            return True
        
        try:
            message = self._build_email(to_email, subject, html_content, template_data)
            response = self.client.send(message)
            
            if response.status_code in [200, 201, 202]:
                logger.info(f"Email sent to {to_email}: {subject}")
                return True
            else:
                logger.error(f"Email failed ({response.status_code}): {response.body}")
                return False
                
        except Exception as e:
            logger.error(f"Email error: {e}")
            return False
    
    async def send_template(
        self,
        to_email: str,
        template: EmailTemplate,
        template_data: Dict[str, Any] = None
    ) -> bool:
        """Send email using template."""
        template_def = DEFAULT_TEMPLATES.get(template)
        
        if not template_def:
            logger.error(f"Template not found: {template}")
            return False
        
        return await self.send_email(
            to_email=to_email,
            subject=template_def["subject"],
            html_content=template_def["html"],
            template_data=template_data
        )
    
    # ============== SPECIFIC EMAIL METHODS ==============
    
    async def send_welcome(self, to_email: str, username: str, app_url: str) -> bool:
        """Send welcome email."""
        return await self.send_template(
            to_email=to_email,
            template=EmailTemplate.WELCOME,
            template_data={
                "username": username,
                "app_url": app_url
            }
        )
    
    async def send_password_reset(
        self,
        to_email: str,
        reset_url: str
    ) -> bool:
        """Send password reset email."""
        return await self.send_template(
            to_email=to_email,
            template=EmailTemplate.PASSWORD_RESET,
            template_data={
                "reset_url": reset_url
            }
        )
    
    async def send_geofence_alert(
        self,
        to_email: str,
        device_name: str,
        event_type: str,  # "entered" or "left"
        geofence_name: str,
        location: str,
        app_url: str
    ) -> bool:
        """Send geofence alert email."""
        return await self.send_template(
            to_email=to_email,
            template=EmailTemplate.GEOFENCE_ALERT,
            template_data={
                "device_name": device_name,
                "event_type": event_type,
                "geofence_name": geofence_name,
                "location": location,
                "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
                "alert_color": "#22c55e" if event_type == "entered" else "#ef4444",
                "app_url": app_url
            }
        )
    
    async def send_security_alert(
        self,
        to_email: str,
        alert_title: str,
        alert_message: str,
        ip_address: str,
        device_info: str,
        app_url: str
    ) -> bool:
        """Send security alert email."""
        return await self.send_template(
            to_email=to_email,
            template=EmailTemplate.SECURITY_ALERT,
            template_data={
                "alert_title": alert_title,
                "alert_message": alert_message,
                "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
                "ip_address": ip_address,
                "device_info": device_info,
                "app_url": app_url
            }
        )
    
    async def send_bulk(
        self,
        recipients: List[Dict[str, Any]],
        template: EmailTemplate
    ) -> Dict[str, int]:
        """Send bulk emails."""
        results = {"success": 0, "failed": 0}
        
        for recipient in recipients:
            success = await self.send_template(
                to_email=recipient["email"],
                template=template,
                template_data=recipient.get("data", {})
            )
            
            if success:
                results["success"] += 1
            else:
                results["failed"] += 1
        
        return results


# ============== SINGLETON ==============

email_service = EmailService()


# ============== API FUNCTIONS ==============

async def send_welcome_email(email: str, username: str) -> bool:
    """Send welcome email to new user."""
    app_url = os.getenv("APP_URL", "https://pathmap.com")
    return await email_service.send_welcome(email, username, app_url)


async def send_password_reset_email(email: str, token: str) -> bool:
    """Send password reset email."""
    app_url = os.getenv("APP_URL", "https://pathmap.com")
    reset_url = f"{app_url}/reset-password?token={token}"
    return await email_service.send_password_reset(email, reset_url)


async def send_geofence_notification(
    email: str,
    device_name: str,
    event_type: str,
    geofence_name: str,
    lat: float,
    lng: float
) -> bool:
    """Send geofence alert."""
    app_url = os.getenv("APP_URL", "https://pathmap.com")
    location = f"{lat:.6f}, {lng:.6f}"
    return await email_service.send_geofence_alert(
        email, device_name, event_type, geofence_name, location, app_url
    )


async def send_security_notification(
    email: str,
    title: str,
    message: str,
    ip: str,
    device: str
) -> bool:
    """Send security alert."""
    app_url = os.getenv("APP_URL", "https://pathmap.com")
    return await email_service.send_security_alert(
        email, title, message, ip, device, app_url
    )
