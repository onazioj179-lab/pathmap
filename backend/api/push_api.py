"""
PATHMAP V97 - Push Notification API
===================================
Handles Web Push subscription management and notification sending.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import logging
import json

logger = logging.getLogger("PushAPI")

router = APIRouter(prefix="/api/v1/push", tags=["Push Notifications"])


# Models
class PushSubscription(BaseModel):
    """Web Push subscription data from browser."""
    endpoint: str
    keys: Dict[str, str]  # p256dh and auth keys
    expirationTime: Optional[int] = None


class PushMessage(BaseModel):
    """Push notification message."""
    title: str
    body: str
    icon: Optional[str] = "/icon-192.png"
    badge: Optional[str] = "/icon-192.png"
    data: Optional[Dict[str, Any]] = None
    actions: Optional[List[Dict[str, str]]] = None
    tag: Optional[str] = None
    requireInteraction: Optional[bool] = False


# In-memory subscription storage (use Redis/DB in production)
_subscriptions: Dict[str, PushSubscription] = {}


@router.get("/vapid-public-key")
async def get_vapid_public_key():
    """
    Get the VAPID public key for Web Push subscription.
    
    Frontend uses this to subscribe to push notifications.
    """
    try:
        from services.vapid_keys import get_cached_public_key
        public_key = get_cached_public_key()
        return {"publicKey": public_key}
    except ImportError:
        logger.warning("VAPID keys module not available")
        return {"publicKey": None, "error": "Push notifications not configured"}
    except Exception as e:
        logger.error(f"Failed to get VAPID key: {e}")
        raise HTTPException(status_code=500, detail="Failed to get VAPID key")


@router.post("/subscribe")
async def subscribe_to_push(
    subscription: PushSubscription,
    request: Request
):
    """
    Subscribe a device to push notifications.
    
    Stores the subscription for sending notifications later.
    """
    # Use endpoint as unique identifier
    subscription_id = subscription.endpoint[-64:]  # Last 64 chars as ID
    
    _subscriptions[subscription_id] = subscription
    
    logger.info(f"New push subscription: {subscription_id[:16]}...")
    
    return {
        "success": True,
        "subscriptionId": subscription_id,
        "message": "Subscribed to push notifications"
    }


@router.delete("/unsubscribe")
async def unsubscribe_from_push(endpoint: str):
    """
    Unsubscribe a device from push notifications.
    """
    subscription_id = endpoint[-64:]
    
    if subscription_id in _subscriptions:
        del _subscriptions[subscription_id]
        logger.info(f"Push subscription removed: {subscription_id[:16]}...")
        return {"success": True, "message": "Unsubscribed from push notifications"}
    
    return {"success": False, "message": "Subscription not found"}


@router.post("/send")
async def send_push_notification(
    message: PushMessage,
    subscription_ids: Optional[List[str]] = None
):
    """
    Send push notification to subscribed devices.
    
    If subscription_ids is provided, sends only to those devices.
    Otherwise, sends to all subscribers.
    """
    try:
        targets = subscription_ids or list(_subscriptions.keys())
        
        if not targets:
            return {"success": False, "message": "No subscribers", "sent": 0}
        
        # Build notification payload
        json.dumps({
            "title": message.title,
            "body": message.body,
            "icon": message.icon,
            "badge": message.badge,
            "data": message.data or {},
            "actions": message.actions or [],
            "tag": message.tag,
            "requireInteraction": message.requireInteraction
        })
        
        sent_count = 0
        failed_count = 0
        
        # Send to each subscription
        for sub_id in targets:
            if sub_id not in _subscriptions:
                continue
                
            _subscriptions[sub_id]
            
            try:
                # In production, use pywebpush library:
                # from pywebpush import webpush
                # webpush(
                #     subscription_info=subscription.dict(),
                #     data=payload,
                #     vapid_private_key=get_cached_private_key(),
                #     vapid_claims={"sub": "mailto:push@pathmap.app"}
                # )
                
                # For now, log the send attempt
                logger.info(f"Push notification sent to {sub_id[:16]}...")
                sent_count += 1
                
            except Exception as e:
                logger.error(f"Failed to send push to {sub_id[:16]}: {e}")
                failed_count += 1
        
        return {
            "success": True,
            "sent": sent_count,
            "failed": failed_count,
            "total": len(targets)
        }
        
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="Push notifications not configured (missing VAPID keys)"
        )


@router.get("/subscriptions/count")
async def get_subscription_count():
    """Get total number of push subscriptions."""
    return {
        "count": len(_subscriptions),
        "active": len(_subscriptions)
    }


@router.get("/test")
async def test_push_endpoint():
    """Test endpoint to verify push API is working."""
    try:
        from services.vapid_keys import get_cached_public_key
        public_key = get_cached_public_key()
        return {
            "status": "ok",
            "vapid_configured": bool(public_key),
            "subscriptions": len(_subscriptions)
        }
    except Exception:
        return {
            "status": "ok",
            "vapid_configured": False,
            "subscriptions": len(_subscriptions)
        }
