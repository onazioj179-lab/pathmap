"""
PATHMAP - OAuth Provider Integration
====================================
Support for Google, Apple, and other OAuth providers.
"""

import time
import uuid
# Reserved for future use
from typing import Optional, Dict, Any, Tuple
from dataclasses import dataclass
from urllib.parse import urlencode


@dataclass
class OAuthConfig:
    """OAuth provider configuration"""
    provider: str
    client_id: str
    client_secret: str
    redirect_uri: str
    authorization_url: str
    token_url: str
    user_info_url: str
    scopes: list[str]


@dataclass
class OAuthUser:
    """OAuth user data from provider"""
    provider: str
    provider_user_id: str
    email: str
    name: str
    picture: Optional[str]


class OAuthManager:
    """
    OAuth 2.0 Manager for third-party authentication.
    
    Supports:
    - Google
    - Apple
    - Facebook (optional)
    
    Configuration via environment or settings.
    """
    
    # Default provider configurations
    PROVIDERS = {
        'google': OAuthConfig(
            provider='google',
            client_id='',
            client_secret='',
            redirect_uri='',
            authorization_url='https://accounts.google.com/o/oauth2/v2/auth',
            token_url='https://oauth2.googleapis.com/token',
            user_info_url='https://www.googleapis.com/oauth2/v2/userinfo',
            scopes=['openid', 'email', 'profile']
        ),
        'apple': OAuthConfig(
            provider='apple',
            client_id='',
            client_secret='',
            redirect_uri='',
            authorization_url='https://appleid.apple.com/auth/authorize',
            token_url='https://appleid.apple.com/auth/token',
            user_info_url='',  # Apple includes user info in token
            scopes=['name', 'email']
        ),
        'facebook': OAuthConfig(
            provider='facebook',
            client_id='',
            client_secret='',
            redirect_uri='',
            authorization_url='https://www.facebook.com/v18.0/dialog/oauth',
            token_url='https://graph.facebook.com/v18.0/oauth/access_token',
            user_info_url='https://graph.facebook.com/me?fields=id,name,email,picture',
            scopes=['email', 'public_profile']
        )
    }
    
    def __init__(self):
        """Initialize OAuth manager with provider configs."""
        self.providers: Dict[str, OAuthConfig] = {}
        self.state_store: Dict[str, Dict[str, Any]] = {}  # In production, use Redis/DB
    
    def configure_provider(
        self,
        provider: str,
        client_id: str,
        client_secret: str,
        redirect_uri: str
    ) -> bool:
        """
        Configure an OAuth provider.
        
        Args:
            provider: Provider name (google, apple, facebook)
            client_id: OAuth client ID
            client_secret: OAuth client secret
            redirect_uri: OAuth redirect URI
            
        Returns:
            True if provider was configured successfully
        """
        if provider not in self.PROVIDERS:
            return False
        
        config = self.PROVIDERS[provider]
        self.providers[provider] = OAuthConfig(
            provider=provider,
            client_id=client_id,
            client_secret=client_secret,
            redirect_uri=redirect_uri,
            authorization_url=config.authorization_url,
            token_url=config.token_url,
            user_info_url=config.user_info_url,
            scopes=config.scopes
        )
        return True
    
    def generate_auth_url(self, provider: str) -> Tuple[bool, str]:
        """
        Generate OAuth authorization URL.
        
        Args:
            provider: Provider name
            
        Returns:
            Tuple of (success, url_or_error)
        """
        if provider not in self.providers:
            return False, f"Provider {provider} not configured"
        
        config = self.providers[provider]
        
        # Generate state for CSRF protection
        state = str(uuid.uuid4())
        self.state_store[state] = {
            'provider': provider,
            'created_at': time.time(),
            'expires_at': time.time() + 600  # 10 minutes
        }
        
        params = {
            'client_id': config.client_id,
            'redirect_uri': config.redirect_uri,
            'response_type': 'code',
            'scope': ' '.join(config.scopes),
            'state': state
        }
        
        # Provider-specific params
        if provider == 'google':
            params['access_type'] = 'offline'
            params['prompt'] = 'consent'
        elif provider == 'apple':
            params['response_mode'] = 'form_post'
        
        url = f"{config.authorization_url}?{urlencode(params)}"
        return True, url
    
    def verify_state(self, state: str) -> bool:
        """
        Verify OAuth state parameter.
        
        Args:
            state: State parameter from callback
            
        Returns:
            True if state is valid
        """
        if state not in self.state_store:
            return False
        
        state_data = self.state_store[state]
        
        # Check expiration
        if time.time() > state_data['expires_at']:
            del self.state_store[state]
            return False
        
        # State is valid, remove it (one-time use)
        del self.state_store[state]
        return True
    
    def get_provider_config(self, provider: str) -> Optional[OAuthConfig]:
        """Get configuration for a provider."""
        return self.providers.get(provider)
    
    def get_configured_providers(self) -> list[str]:
        """Get list of configured provider names."""
        return list(self.providers.keys())
    
    def parse_google_user(self, user_data: Dict[str, Any]) -> OAuthUser:
        """Parse Google user info response."""
        return OAuthUser(
            provider='google',
            provider_user_id=user_data.get('id', ''),
            email=user_data.get('email', ''),
            name=user_data.get('name', ''),
            picture=user_data.get('picture')
        )
    
    def parse_apple_token(self, id_token_payload: Dict[str, Any]) -> OAuthUser:
        """Parse Apple ID token payload."""
        return OAuthUser(
            provider='apple',
            provider_user_id=id_token_payload.get('sub', ''),
            email=id_token_payload.get('email', ''),
            name=id_token_payload.get('name', id_token_payload.get('email', '').split('@')[0]),
            picture=None
        )
    
    def parse_facebook_user(self, user_data: Dict[str, Any]) -> OAuthUser:
        """Parse Facebook user info response."""
        picture = None
        if 'picture' in user_data and 'data' in user_data['picture']:
            picture = user_data['picture']['data'].get('url')
        
        return OAuthUser(
            provider='facebook',
            provider_user_id=user_data.get('id', ''),
            email=user_data.get('email', ''),
            name=user_data.get('name', ''),
            picture=picture
        )


# Singleton instance
_oauth_manager: Optional[OAuthManager] = None


def get_oauth_manager() -> OAuthManager:
    """Get or create the OAuthManager singleton."""
    global _oauth_manager
    if _oauth_manager is None:
        _oauth_manager = OAuthManager()
    return _oauth_manager
