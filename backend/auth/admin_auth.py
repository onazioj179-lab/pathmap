"""
PATHMAP - Admin Authentication
===============================
JWT-based admin authorization with proper security checks.
"""

import os
import jwt
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import logging

logger = logging.getLogger(__name__)

# JWT configuration
JWT_SECRET = os.getenv("JWT_SECRET_KEY", "")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

# Security scheme for Swagger UI
security = HTTPBearer(scheme_name="JWT Admin Token", description="Bearer token with admin role")


class AdminUser:
    """Authenticated admin user."""
    def __init__(self, user_id: str, username: str, email: str):
        self.user_id = user_id
        self.username = username
        self.email = email


async def require_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> AdminUser:
    """
    Verify JWT token and check admin role.
    
    Raises:
        HTTPException: 401 if token invalid, 403 if not admin
    """
    token = credentials.credentials
    
    if not JWT_SECRET:
        logger.error("JWT_SECRET not configured - rejecting admin access")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication system not configured"
        )
    
    try:
        # Decode and verify token
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        
        # Extract claims
        user_id: Optional[str] = payload.get("sub")
        username: Optional[str] = payload.get("username")
        email: Optional[str] = payload.get("email")
        is_admin: bool = payload.get("is_admin", False)
        
        # Validate required fields
        if not user_id or not username:
            logger.warning(f"Token missing required fields: sub={user_id}, username={username}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token claims"
            )
        
        # Check admin role
        if not is_admin:
            logger.warning(f"Non-admin user {username} attempted admin access")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin role required"
            )
        
        logger.info(f"Admin authenticated: {username} (user_id={user_id})")
        return AdminUser(user_id=user_id, username=username, email=email or "")
    
    except jwt.ExpiredSignatureError:
        logger.warning("Expired admin token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired"
        )
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid admin token: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token"
        )
    except Exception as e:
        logger.error(f"Admin authentication error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication failed"
        )


async def optional_admin(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[AdminUser]:
    """
    Check for admin token but don't require it.
    Useful for endpoints that have different behavior for admins.
    
    Returns None if no token or invalid token.
    """
    if not credentials:
        return None
    
    try:
        return await require_admin(credentials)
    except HTTPException:
        return None
