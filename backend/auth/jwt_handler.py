"""
PATHMAP - JWT Token Handler
===========================
JSON Web Token generation and validation.
Pure Python implementation using HMAC-SHA256.
"""

import json
import base64
import hmac
import hashlib
import time
import secrets
from typing import Optional, Dict, Any
from dataclasses import dataclass


@dataclass
class TokenPayload:
    """JWT token payload structure"""
    user_id: str
    username: str
    email: str
    issued_at: float
    expires_at: float
    token_type: str  # 'access' or 'refresh'


class JWTHandler:
    """
    JWT Handler using HMAC-SHA256.
    
    Pure Python implementation for long-term stability.
    No external JWT libraries needed.
    """
    
    # Token expiration times (seconds)
    ACCESS_TOKEN_EXPIRE = 3600  # 1 hour
    REFRESH_TOKEN_EXPIRE = 604800  # 7 days
    
    def __init__(self, secret_key: Optional[str] = None):
        """
        Initialize JWT handler.
        
        Args:
            secret_key: HMAC secret key. Auto-generated if not provided.
        """
        self.secret_key = secret_key or secrets.token_urlsafe(64)
    
    def _base64url_encode(self, data: bytes) -> str:
        """Base64URL encode without padding."""
        return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')
    
    def _base64url_decode(self, data: str) -> bytes:
        """Base64URL decode with padding restoration."""
        padding = 4 - len(data) % 4
        if padding != 4:
            data += '=' * padding
        return base64.urlsafe_b64decode(data)
    
    def _sign(self, message: str) -> str:
        """Create HMAC-SHA256 signature."""
        signature = hmac.new(
            self.secret_key.encode('utf-8'),
            message.encode('utf-8'),
            hashlib.sha256
        ).digest()
        return self._base64url_encode(signature)
    
    def create_token(
        self,
        user_id: str,
        username: str,
        email: str,
        token_type: str = 'access',
        custom_claims: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Create a JWT token.
        
        Args:
            user_id: User's unique ID
            username: User's username
            email: User's email
            token_type: 'access' or 'refresh'
            custom_claims: Additional claims to include
            
        Returns:
            JWT token string
        """
        now = time.time()
        
        if token_type == 'refresh':
            expires = now + self.REFRESH_TOKEN_EXPIRE
        else:
            expires = now + self.ACCESS_TOKEN_EXPIRE
        
        # JWT Header
        header: Dict[str, str] = {
            "alg": "HS256",
            "typ": "JWT"
        }
        
        # JWT Payload
        payload: Dict[str, Any] = {
            "sub": user_id,
            "username": username,
            "email": email,
            "iat": now,
            "exp": expires,
            "type": token_type
        }
        
        if custom_claims:
            payload.update(custom_claims)
        
        # Encode header and payload
        header_b64 = self._base64url_encode(json.dumps(header).encode('utf-8'))
        payload_b64 = self._base64url_encode(json.dumps(payload).encode('utf-8'))
        
        # Create signature
        message = f"{header_b64}.{payload_b64}"
        signature = self._sign(message)
        
        return f"{message}.{signature}"
    
    def verify_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Verify and decode a JWT token.
        
        Args:
            token: JWT token string
            
        Returns:
            Decoded payload if valid, None otherwise
        """
        try:
            parts = token.split('.')
            if len(parts) != 3:
                return None
            
            header_b64, payload_b64, signature = parts
            
            # Verify signature
            message = f"{header_b64}.{payload_b64}"
            expected_signature = self._sign(message)
            
            if not hmac.compare_digest(signature, expected_signature):
                return None
            
            # Decode payload
            payload = json.loads(self._base64url_decode(payload_b64))
            
            # Check expiration
            if payload.get('exp', 0) < time.time():
                return None
            
            return payload
            
        except (ValueError, json.JSONDecodeError, KeyError):
            return None
    
    def refresh_access_token(self, refresh_token: str) -> Optional[str]:
        """
        Create a new access token from a valid refresh token.
        
        Args:
            refresh_token: Valid refresh token
            
        Returns:
            New access token if refresh token is valid, None otherwise
        """
        payload = self.verify_token(refresh_token)
        
        if not payload:
            return None
        
        if payload.get('type') != 'refresh':
            return None
        
        return self.create_token(
            user_id=payload['sub'],
            username=payload['username'],
            email=payload['email'],
            token_type='access'
        )
    
    def create_token_pair(
        self,
        user_id: str,
        username: str,
        email: str
    ) -> Dict[str, str]:
        """
        Create both access and refresh tokens.
        
        Returns:
            Dict with 'access_token' and 'refresh_token'
        """
        result: Dict[str, Any] = {
            'access_token': self.create_token(user_id, username, email, 'access'),
            'refresh_token': self.create_token(user_id, username, email, 'refresh'),
            'token_type': 'bearer',
            'expires_in': self.ACCESS_TOKEN_EXPIRE
        }
        return result


# Singleton instance
_jwt_handler: Optional[JWTHandler] = None


def get_jwt_handler() -> JWTHandler:
    """Get or create the JWT handler singleton."""
    global _jwt_handler
    if _jwt_handler is None:
        _jwt_handler = JWTHandler()
    return _jwt_handler
