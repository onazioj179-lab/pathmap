"""
PATHMAP V97 - Web Push VAPID Key Management
===========================================
Generates and manages VAPID keys for Web Push notifications.
Keys are persisted in environment or file for reuse.
"""

import os
import json
import base64
import logging
from pathlib import Path
from typing import Optional, Dict

logger = logging.getLogger("VAPIDKeys")

# VAPID key file location
VAPID_KEY_FILE = Path(__file__).parent.parent / "data" / "vapid_keys.json"


def base64url_encode(data: bytes) -> str:
    """URL-safe base64 encoding without padding."""
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')


def base64url_decode(data: str) -> bytes:
    """URL-safe base64 decoding with padding fix."""
    padding = 4 - len(data) % 4
    if padding != 4:
        data += '=' * padding
    return base64.urlsafe_b64decode(data)


def generate_vapid_keys() -> Dict[str, str]:
    """
    Generate new VAPID keys using cryptography library.
    
    Returns:
        Dict with 'public_key' and 'private_key' in base64url format
    """
    try:
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.backends import default_backend
        
        # Generate P-256 key pair
        private_key = ec.generate_private_key(ec.SECP256R1(), default_backend())
        public_key = private_key.public_key()
        
        # Get private key bytes (32 bytes)
        private_numbers = private_key.private_numbers()
        private_bytes = private_numbers.private_value.to_bytes(32, byteorder='big')
        
        # Get public key bytes in uncompressed format (65 bytes: 0x04 || x || y)
        public_bytes = public_key.public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint
        )
        
        return {
            'public_key': base64url_encode(public_bytes),
            'private_key': base64url_encode(private_bytes),
        }
        
    except ImportError:
        logger.error("cryptography library not installed. Run: pip install cryptography")
        raise RuntimeError("cryptography library required for VAPID key generation")


def load_vapid_keys() -> Optional[Dict[str, str]]:
    """Load VAPID keys from environment or file."""
    # Try environment first
    public = os.environ.get('VAPID_PUBLIC_KEY')
    private = os.environ.get('VAPID_PRIVATE_KEY')
    
    if public and private:
        return {'public_key': public, 'private_key': private}
    
    # Try file
    if VAPID_KEY_FILE.exists():
        try:
            with open(VAPID_KEY_FILE, 'r') as f:
                keys = json.load(f)
                if 'public_key' in keys and 'private_key' in keys:
                    return keys
        except Exception as e:
            logger.warning(f"Failed to load VAPID keys from file: {e}")
    
    return None


def save_vapid_keys(keys: Dict[str, str]) -> bool:
    """Save VAPID keys to file."""
    try:
        VAPID_KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(VAPID_KEY_FILE, 'w') as f:
            json.dump(keys, f, indent=2)
        logger.info(f"VAPID keys saved to {VAPID_KEY_FILE}")
        return True
    except Exception as e:
        logger.error(f"Failed to save VAPID keys: {e}")
        return False


def get_vapid_keys() -> Dict[str, str]:
    """
    Get VAPID keys, generating if necessary.
    
    Returns:
        Dict with 'public_key' and 'private_key'
    """
    keys = load_vapid_keys()
    
    if keys:
        logger.info("Using existing VAPID keys")
        return keys
    
    logger.info("Generating new VAPID keys...")
    keys = generate_vapid_keys()
    save_vapid_keys(keys)
    
    return keys


def get_public_key() -> str:
    """Get just the public VAPID key for frontend use."""
    keys = get_vapid_keys()
    return keys['public_key']


# V97: VAPID endpoint for frontend to fetch public key
_cached_keys: Optional[Dict[str, str]] = None


def get_cached_public_key() -> str:
    """Get cached public key (avoids regenerating)."""
    global _cached_keys
    if _cached_keys is None:
        _cached_keys = get_vapid_keys()
    return _cached_keys['public_key']


def get_cached_private_key() -> str:
    """Get cached private key for signing."""
    global _cached_keys
    if _cached_keys is None:
        _cached_keys = get_vapid_keys()
    return _cached_keys['private_key']


# CLI interface
if __name__ == '__main__':
    import sys
    
    if '--generate' in sys.argv:
        keys = generate_vapid_keys()
        print("Generated VAPID Keys:")
        print(f"  Public Key:  {keys['public_key']}")
        print(f"  Private Key: {keys['private_key']}")
        
        if '--save' in sys.argv:
            save_vapid_keys(keys)
            print(f"\nKeys saved to: {VAPID_KEY_FILE}")
        else:
            print("\nAdd --save to persist keys")
            
    elif '--show' in sys.argv:
        keys = load_vapid_keys()
        if keys:
            print("Existing VAPID Keys:")
            print(f"  Public Key:  {keys['public_key']}")
            print(f"  Private Key: {keys['private_key'][:20]}...")
        else:
            print("No existing VAPID keys found")
            
    else:
        print("VAPID Key Management")
        print("Usage:")
        print("  python vapid_keys.py --generate       Generate new keys")
        print("  python vapid_keys.py --generate --save  Generate and save")
        print("  python vapid_keys.py --show           Show existing keys")
