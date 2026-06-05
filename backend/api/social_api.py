"""
PATHMAP - API Routes for Find My Friends Features
=================================================
FastAPI routes for authentication, friends, and sharing.
"""

from fastapi import APIRouter, HTTPException, Depends, Header, Request
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

# Import backend modules
from auth import get_auth_core, get_jwt_handler
from friends import get_friend_manager, get_friend_groups
from sharing import get_sharing_manager, get_geofence_manager
from security import get_rate_limiter, get_privacy_manager

# Create router
router_social = APIRouter(prefix="/api/v1/social", tags=["Social"])


# ============== PYDANTIC MODELS ==============

class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=30)
    email: str
    password: str = Field(..., min_length=8)
    display_name: Optional[str] = None
    phone: Optional[str] = None


class LoginRequest(BaseModel):
    identifier: str  # username or email
    password: str
    device_id: Optional[str] = "unknown"
    device_name: Optional[str] = "Unknown Device"


class TokenRefreshRequest(BaseModel):
    refresh_token: str


class ProfileUpdateRequest(BaseModel):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    phone: Optional[str] = None


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


class FriendRequestRequest(BaseModel):
    to_user_id: str
    message: Optional[str] = None


class FriendGroupRequest(BaseModel):
    name: str
    color: Optional[str] = "#45B7D1"
    icon: Optional[str] = "users"
    can_see_location: Optional[bool] = True
    location_precision: Optional[str] = "approximate"


class StartSharingRequest(BaseModel):
    shared_with_id: str
    precision: Optional[str] = "approximate"  # exact, approximate, city
    duration_seconds: Optional[int] = None    # None = indefinite


class LocationUpdateRequest(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = 0.0
    altitude: Optional[float] = None
    speed: Optional[float] = None
    heading: Optional[float] = None


class GeofenceRequest(BaseModel):
    name: str
    latitude: float
    longitude: float
    radius_meters: Optional[float] = 100
    trigger_type: Optional[str] = "both"  # enter, exit, both
    user_ids: Optional[List[str]] = None


class PrivacySettingsRequest(BaseModel):
    data_retention_days: Optional[int] = None
    share_analytics: Optional[bool] = None
    allow_tracking: Optional[bool] = None
    discoverable: Optional[bool] = None
    show_online_status: Optional[bool] = None
    show_last_location: Optional[bool] = None


# ============== AUTH DEPENDENCY ==============

async def get_current_user(authorization: Optional[str] = Header(None)):
    """Extract and verify user from Authorization header."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization format")
    
    token = authorization.split(" ")[1]
    jwt_handler = get_jwt_handler()
    payload = jwt_handler.verify_token(token)
    
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    return payload


async def rate_limit_check(request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    """Check rate limits for authenticated requests."""
    limiter = get_rate_limiter()
    
    client_host = request.client.host if request.client else 'unknown'
    identifier = str(user.get('sub', client_host))
    allowed, reason, retry_after = limiter.check_limit(identifier, 'api')
    
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=reason,
            headers={"Retry-After": str(retry_after)}
        )
    
    limiter.record_request(identifier)
    return user


# ============== AUTH ENDPOINTS ==============

@router_social.post("/auth/register")
async def register(req: RegisterRequest, request: Request):
    """Register a new user account."""
    limiter = get_rate_limiter()
    
    # Rate limit registration attempts
    client_host = request.client.host if request.client else 'unknown'
    allowed, reason, retry_after = limiter.check_limit(client_host, 'auth')
    if not allowed:
        raise HTTPException(status_code=429, detail=reason)
    limiter.record_request(client_host)
    
    auth = get_auth_core()
    success, message, user = auth.register(
        username=req.username,
        email=req.email,
        password=req.password,
        display_name=req.display_name,
        phone=req.phone
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    # Create default friend groups for new user
    groups = get_friend_groups()
    if user:
        groups.create_default_groups(user.id)
    
    # Auto-login after registration
    success, message, tokens = auth.login(
        identifier=req.username,
        password=req.password,
        device_id="registration",
        device_name="Registration Device",
        ip_address=client_host
    )
    
    return {
        "success": True,
        "message": "Registration successful",
        "data": tokens
    }


@router_social.post("/auth/login")
async def login(req: LoginRequest, request: Request):
    """Login with username/email and password."""
    limiter = get_rate_limiter()
    client_host = request.client.host if request.client else 'unknown'
    
    allowed, reason, retry_after = limiter.check_limit(client_host, 'auth')
    if not allowed:
        raise HTTPException(status_code=429, detail=reason)
    limiter.record_request(client_host)
    
    auth = get_auth_core()
    success, message, data = auth.login(
        identifier=req.identifier,
        password=req.password,
        device_id=req.device_id or 'unknown',
        device_name=req.device_name or 'Unknown Device',
        ip_address=client_host
    )
    
    if not success:
        raise HTTPException(status_code=401, detail=message)
    
    return {
        "success": True,
        "message": message,
        "data": data
    }


@router_social.post("/auth/refresh")
async def refresh_token(req: TokenRefreshRequest):
    """Refresh access token using refresh token."""
    auth = get_auth_core()
    new_tokens = auth.refresh_token(req.refresh_token)
    
    if not new_tokens:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    
    return {
        "success": True,
        "data": new_tokens
    }


@router_social.post("/auth/logout")
async def logout(user: Dict[str, Any] = Depends(get_current_user)):
    """Logout current session."""
    get_auth_core()
    # Note: In production, you'd track session_id in the token
    return {
        "success": True,
        "message": "Logged out successfully"
    }


@router_social.get("/auth/me")
async def get_profile(user: Dict[str, Any] = Depends(rate_limit_check)):
    """Get current user profile."""
    auth = get_auth_core()
    user_data = auth.get_user(user['sub'])
    
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "success": True,
        "data": user_data.to_public_dict()
    }


@router_social.put("/auth/profile")
async def update_profile(req: ProfileUpdateRequest, user: Dict[str, Any] = Depends(rate_limit_check)):
    """Update user profile."""
    auth = get_auth_core()
    success, message = auth.update_profile(
        user_id=user['sub'],
        display_name=req.display_name,
        avatar_url=req.avatar_url,
        phone=req.phone
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"success": True, "message": message}


@router_social.post("/auth/change-password")
async def change_password(req: PasswordChangeRequest, user: Dict[str, Any] = Depends(rate_limit_check)):
    """Change user password."""
    auth = get_auth_core()
    success, message = auth.change_password(
        user_id=user['sub'],
        current_password=req.current_password,
        new_password=req.new_password
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"success": True, "message": message}


# ============== USER SEARCH ==============

@router_social.get("/users/search")
async def search_users(q: str, limit: int = 20, user: Dict[str, Any] = Depends(rate_limit_check)):
    """Search for users by username or display name."""
    auth = get_auth_core()
    results = auth.search_users(
        query=q,
        limit=min(limit, 50),
        exclude_user_id=user['sub']
    )
    
    return {
        "success": True,
        "data": results
    }


# ============== FRIENDS ENDPOINTS ==============

@router_social.get("/friends")
async def get_friends(user: Dict[str, Any] = Depends(rate_limit_check)):
    """Get list of friends."""
    manager = get_friend_manager()
    friends = manager.get_friends(user['sub'])
    
    return {
        "success": True,
        "data": friends,
        "count": len(friends)
    }


@router_social.post("/friends/request")
async def send_friend_request(req: FriendRequestRequest, user: Dict[str, Any] = Depends(rate_limit_check)):
    """Send a friend request."""
    manager = get_friend_manager()
    success, message = manager.send_friend_request(
        from_user_id=user['sub'],
        to_user_id=req.to_user_id,
        message=req.message
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"success": True, "message": message}


@router_social.get("/friends/requests")
async def get_friend_requests(user: Dict[str, Any] = Depends(rate_limit_check)):
    """Get pending friend requests."""
    manager = get_friend_manager()
    requests = manager.get_pending_requests(user['sub'])
    
    return {
        "success": True,
        "data": requests
    }


@router_social.post("/friends/accept/{from_user_id}")
async def accept_friend_request(from_user_id: str, user: Dict[str, Any] = Depends(rate_limit_check)):
    """Accept a friend request."""
    manager = get_friend_manager()
    success, message = manager.accept_friend_request(from_user_id, user['sub'])
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"success": True, "message": message}


@router_social.post("/friends/decline/{from_user_id}")
async def decline_friend_request(from_user_id: str, user: Dict[str, Any] = Depends(rate_limit_check)):
    """Decline a friend request."""
    manager = get_friend_manager()
    success, message = manager.decline_friend_request(from_user_id, user['sub'])
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"success": True, "message": message}


@router_social.delete("/friends/{friend_id}")
async def remove_friend(friend_id: str, user: Dict[str, Any] = Depends(rate_limit_check)):
    """Remove a friend."""
    manager = get_friend_manager()
    success, message = manager.remove_friend(user['sub'], friend_id)
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"success": True, "message": message}


@router_social.post("/friends/block/{blocked_user_id}")
async def block_user(blocked_user_id: str, user: Dict[str, Any] = Depends(rate_limit_check)):
    """Block a user."""
    manager = get_friend_manager()
    success, message = manager.block_user(user['sub'], blocked_user_id)
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"success": True, "message": message}


@router_social.post("/friends/unblock/{blocked_user_id}")
async def unblock_user(blocked_user_id: str, user: Dict[str, Any] = Depends(rate_limit_check)):
    """Unblock a user."""
    manager = get_friend_manager()
    success, message = manager.unblock_user(user['sub'], blocked_user_id)
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"success": True, "message": message}


@router_social.get("/friends/blocked")
async def get_blocked_users(user: Dict[str, Any] = Depends(rate_limit_check)):
    """Get list of blocked users."""
    manager = get_friend_manager()
    blocked = manager.get_blocked_users(user['sub'])
    
    return {
        "success": True,
        "data": blocked
    }


# ============== FRIEND GROUPS ==============

@router_social.get("/groups")
async def get_friend_groups_list(user: Dict[str, Any] = Depends(rate_limit_check)):
    """Get friend groups (circles)."""
    groups = get_friend_groups()
    data = groups.get_groups(user['sub'])
    
    return {
        "success": True,
        "data": data
    }


@router_social.post("/groups")
async def create_friend_group(req: FriendGroupRequest, user: Dict[str, Any] = Depends(rate_limit_check)):
    """Create a new friend group."""
    groups = get_friend_groups()
    success, message, group_id = groups.create_group(
        user_id=user['sub'],
        name=req.name,
        color=req.color or '#45B7D1',
        icon=req.icon or 'users',
        can_see_location=req.can_see_location if req.can_see_location is not None else True,
        location_precision=req.location_precision or 'approximate'
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {
        "success": True,
        "message": message,
        "data": {"group_id": group_id}
    }


@router_social.put("/groups/{group_id}")
async def update_friend_group(
    group_id: str,
    req: FriendGroupRequest,
    user: Dict[str, Any] = Depends(rate_limit_check)
):
    """Update a friend group."""
    groups = get_friend_groups()
    success, message = groups.update_group(
        user_id=user['sub'],
        group_id=group_id,
        name=req.name,
        color=req.color,
        icon=req.icon,
        can_see_location=req.can_see_location,
        location_precision=req.location_precision
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"success": True, "message": message}


@router_social.delete("/groups/{group_id}")
async def delete_friend_group(group_id: str, user: Dict[str, Any] = Depends(rate_limit_check)):
    """Delete a friend group."""
    groups = get_friend_groups()
    success, message = groups.delete_group(user['sub'], group_id)
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"success": True, "message": message}


@router_social.get("/groups/{group_id}/members")
async def get_group_members(group_id: str, user: Dict[str, Any] = Depends(rate_limit_check)):
    """Get members of a friend group."""
    groups = get_friend_groups()
    members = groups.get_group_members(user['sub'], group_id)
    
    return {
        "success": True,
        "data": members
    }


@router_social.post("/groups/{group_id}/members/{friend_id}")
async def add_group_member(
    group_id: str,
    friend_id: str,
    user: Dict[str, Any] = Depends(rate_limit_check)
):
    """Add a friend to a group."""
    groups = get_friend_groups()
    success, message = groups.add_member(user['sub'], group_id, friend_id)
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"success": True, "message": message}


@router_social.delete("/groups/{group_id}/members/{friend_id}")
async def remove_group_member(
    group_id: str,
    friend_id: str,
    user: Dict[str, Any] = Depends(rate_limit_check)
):
    """Remove a friend from a group."""
    groups = get_friend_groups()
    success, message = groups.remove_member(user['sub'], group_id, friend_id)
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"success": True, "message": message}


# ============== LOCATION SHARING ==============

@router_social.post("/sharing/start")
async def start_sharing(req: StartSharingRequest, user: Dict[str, Any] = Depends(rate_limit_check)):
    """Start sharing location with a friend."""
    manager = get_sharing_manager()
    success, message, session_id = manager.start_sharing(
        owner_id=user['sub'],
        shared_with_id=req.shared_with_id,
        precision=req.precision,
        duration_seconds=req.duration_seconds
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {
        "success": True,
        "message": message,
        "data": {"session_id": session_id}
    }


@router_social.post("/sharing/stop/{shared_with_id}")
async def stop_sharing(shared_with_id: str, user: Dict[str, Any] = Depends(rate_limit_check)):
    """Stop sharing location with a friend."""
    manager = get_sharing_manager()
    success, message = manager.stop_sharing(user['sub'], shared_with_id)
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"success": True, "message": message}


@router_social.post("/sharing/stop-all")
async def stop_sharing_all(user: Dict[str, Any] = Depends(rate_limit_check)):
    """Stop sharing location with everyone."""
    manager = get_sharing_manager()
    count = manager.stop_sharing_all(user['sub'])
    
    return {
        "success": True,
        "message": f"Stopped {count} sharing sessions"
    }


@router_social.post("/sharing/ghost-mode")
async def toggle_ghost_mode(enable: bool, user: Dict[str, Any] = Depends(rate_limit_check)):
    """Enable or disable ghost mode."""
    manager = get_sharing_manager()
    
    if enable:
        manager.enable_ghost_mode(user['sub'])
        message = "Ghost mode enabled"
    else:
        manager.disable_ghost_mode(user['sub'])
        message = "Ghost mode disabled"
    
    return {"success": True, "message": message}


@router_social.post("/sharing/location")
async def update_location(req: LocationUpdateRequest, user: Dict[str, Any] = Depends(rate_limit_check)):
    """Update current location (broadcasts to friends sharing with)."""
    manager = get_sharing_manager()
    result = manager.update_location(
        user_id=user['sub'],
        latitude=req.latitude,
        longitude=req.longitude,
        accuracy=req.accuracy,
        altitude=req.altitude,
        speed=req.speed,
        heading=req.heading
    )
    
    # Also check geofences
    geofence_mgr = get_geofence_manager()
    alerts = geofence_mgr.check_location(user['sub'], req.latitude, req.longitude)
    
    return {
        "success": True,
        "data": {
            "broadcasts": result.get('broadcasts', 0),
            "geofence_alerts": len(alerts)
        }
    }


@router_social.get("/sharing/friends")
async def get_friend_locations(user: Dict[str, Any] = Depends(rate_limit_check)):
    """Get locations of all friends sharing with you."""
    manager = get_sharing_manager()
    locations = manager.get_all_friend_locations(user['sub'])
    
    return {
        "success": True,
        "data": locations
    }


@router_social.get("/sharing/friend/{friend_id}")
async def get_friend_location(friend_id: str, user: Dict[str, Any] = Depends(rate_limit_check)):
    """Get location of a specific friend."""
    manager = get_sharing_manager()
    location = manager.get_friend_location(user['sub'], friend_id)
    
    if not location:
        raise HTTPException(status_code=404, detail="Location not available")
    
    return {
        "success": True,
        "data": location
    }


@router_social.get("/sharing/sessions")
async def get_sharing_sessions(user: Dict[str, Any] = Depends(rate_limit_check)):
    """Get all active sharing sessions."""
    manager = get_sharing_manager()
    sessions = manager.get_sharing_sessions(user['sub'], direction='both')
    
    return {
        "success": True,
        "data": sessions
    }


# ============== GEOFENCES ==============

@router_social.get("/geofences")
async def get_geofences(user: Dict[str, Any] = Depends(rate_limit_check)):
    """Get all geofences."""
    manager = get_geofence_manager()
    geofences = manager.get_geofences(user['sub'])
    
    return {
        "success": True,
        "data": geofences
    }


@router_social.post("/geofences")
async def create_geofence(req: GeofenceRequest, user: Dict[str, Any] = Depends(rate_limit_check)):
    """Create a new geofence."""
    manager = get_geofence_manager()
    success, message, geofence_id = manager.create_geofence(
        owner_id=user['sub'],
        name=req.name,
        latitude=req.latitude,
        longitude=req.longitude,
        radius_meters=req.radius_meters,
        trigger_type=req.trigger_type,
        user_ids=req.user_ids
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {
        "success": True,
        "message": message,
        "data": {"geofence_id": geofence_id}
    }


@router_social.delete("/geofences/{geofence_id}")
async def delete_geofence(geofence_id: str, user: Dict[str, Any] = Depends(rate_limit_check)):
    """Delete a geofence."""
    manager = get_geofence_manager()
    success, message = manager.delete_geofence(user['sub'], geofence_id)
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"success": True, "message": message}


@router_social.get("/geofences/alerts")
async def get_geofence_alerts(
    limit: int = 50,
    unread_only: bool = False,
    user: Dict[str, Any] = Depends(rate_limit_check)
):
    """Get geofence alerts."""
    manager = get_geofence_manager()
    alerts = manager.get_alerts(user['sub'], limit=limit, unread_only=unread_only)
    
    return {
        "success": True,
        "data": alerts
    }


# ============== SAVED LOCATIONS ==============

@router_social.get("/locations")
async def get_saved_locations(user: Dict[str, Any] = Depends(rate_limit_check)):
    """Get saved locations (home, work, etc.)."""
    manager = get_geofence_manager()
    locations = manager.get_saved_locations(user['sub'])
    
    return {
        "success": True,
        "data": locations
    }


@router_social.post("/locations")
async def save_location(
    name: str,
    latitude: float,
    longitude: float,
    address: Optional[str] = None,
    icon: str = "location",
    user: Dict[str, Any] = Depends(rate_limit_check)
):
    """Save a named location."""
    manager = get_geofence_manager()
    success, message, location_id = manager.save_location(
        user_id=user['sub'],
        name=name,
        latitude=latitude,
        longitude=longitude,
        address=address,
        icon=icon
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {
        "success": True,
        "message": message,
        "data": {"location_id": location_id}
    }


@router_social.delete("/locations/{location_id}")
async def delete_saved_location(location_id: str, user: Dict[str, Any] = Depends(rate_limit_check)):
    """Delete a saved location."""
    manager = get_geofence_manager()
    success = manager.delete_saved_location(user['sub'], location_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Location not found")
    
    return {"success": True, "message": "Location deleted"}


# ============== PRIVACY ==============

@router_social.get("/privacy/settings")
async def get_privacy_settings(user: Dict[str, Any] = Depends(rate_limit_check)):
    """Get privacy settings."""
    manager = get_privacy_manager()
    settings = manager.get_privacy_settings(user['sub'])
    
    return {
        "success": True,
        "data": {
            "data_retention_days": settings.data_retention_days,
            "share_analytics": settings.share_analytics,
            "allow_tracking": settings.allow_tracking,
            "discoverable": settings.discoverable,
            "show_online_status": settings.show_online_status,
            "show_last_location": settings.show_last_location
        }
    }


@router_social.put("/privacy/settings")
async def update_privacy_settings(
    req: PrivacySettingsRequest,
    user: Dict[str, Any] = Depends(rate_limit_check)
):
    """Update privacy settings."""
    manager = get_privacy_manager()
    manager.update_privacy_settings(
        user_id=user['sub'],
        data_retention_days=req.data_retention_days,
        share_analytics=req.share_analytics,
        allow_tracking=req.allow_tracking,
        discoverable=req.discoverable,
        show_online_status=req.show_online_status,
        show_last_location=req.show_last_location
    )
    
    return {"success": True, "message": "Privacy settings updated"}


@router_social.post("/privacy/export")
async def request_data_export(user: Dict[str, Any] = Depends(rate_limit_check)):
    """Request GDPR data export."""
    manager = get_privacy_manager()
    success, message, request_id = manager.request_data_export(user['sub'])
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {
        "success": True,
        "message": message,
        "data": {"request_id": request_id}
    }


@router_social.post("/privacy/delete-account")
async def request_account_deletion(
    reason: Optional[str] = None,
    user: Dict[str, Any] = Depends(rate_limit_check)
):
    """Request account deletion."""
    manager = get_privacy_manager()
    success, message, request_id = manager.request_account_deletion(
        user_id=user['sub'],
        reason=reason
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {
        "success": True,
        "message": message,
        "data": {"request_id": request_id}
    }


@router_social.post("/privacy/cancel-deletion")
async def cancel_account_deletion(user: Dict[str, Any] = Depends(rate_limit_check)):
    """Cancel pending account deletion."""
    manager = get_privacy_manager()
    success, message = manager.cancel_deletion_request(user['sub'])
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"success": True, "message": message}
