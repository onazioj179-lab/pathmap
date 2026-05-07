"""
PATHMAP - End-to-End Encryption
===============================
E2E encryption for location data using AES-GCM.
Pure Python implementation using stdlib.
"""

import os
import json
import hashlib
import hmac
import base64
from typing import Optional, Dict, Any
from dataclasses import dataclass

# Note: Using cryptography library for AES-GCM (more secure than pure Python)
# Falls back to simpler encryption if not available
crypto_available = False
aesgcm_cls: Any = None
hashes_mod: Any = None
hkdf_cls: Any = None
try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM  # type: ignore
    from cryptography.hazmat.primitives import hashes  # type: ignore
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF  # type: ignore
    aesgcm_cls = AESGCM
    hashes_mod = hashes
    hkdf_cls = HKDF
    crypto_available = True
except ImportError:
    pass


@dataclass
class EncryptedPayload:
    """Encrypted data structure"""
    ciphertext: str  # Base64 encoded
    nonce: str       # Base64 encoded
    tag: str         # Base64 encoded (if separate)
    version: int     # Encryption version for future compatibility


class E2EEncryption:
    """
    End-to-End Encryption for Location Data.
    
    Features:
    - AES-256-GCM encryption
    - Per-session keys
    - Key derivation from shared secret
    - Message authentication
    """
    
    # Encryption version for future compatibility
    VERSION = 1
    
    # Key sizes in bytes
    KEY_SIZE = 32  # 256 bits
    NONCE_SIZE = 12  # 96 bits for GCM
    
    def __init__(self, master_key: Optional[bytes] = None):
        """
        Initialize encryption engine.
        
        Args:
            master_key: Optional master key (auto-generated if not provided)
        """
        if master_key:
            self.master_key = master_key
        else:
            self.master_key = os.urandom(self.KEY_SIZE)
        
        # Session keys: {session_id: key}
        self._session_keys: Dict[str, bytes] = {}
    
    def derive_session_key(
        self,
        session_id: str,
        user_a_id: str,
        user_b_id: str
    ) -> bytes:
        """
        Derive a unique session key for two users.
        
        Args:
            session_id: Unique session identifier
            user_a_id: First user ID
            user_b_id: Second user ID
            
        Returns:
            Derived key bytes
        """
        # Sort user IDs for consistency
        users = sorted([user_a_id, user_b_id])
        
        # Create info string for HKDF
        info = f"pathmap-e2e-v{self.VERSION}:{session_id}:{users[0]}:{users[1]}".encode()
        
        if crypto_available and hkdf_cls and hashes_mod:
            # Use HKDF for key derivation
            hkdf = hkdf_cls(
                algorithm=hashes_mod.SHA256(),
                length=self.KEY_SIZE,
                salt=session_id.encode(),
                info=info
            )
            key = hkdf.derive(self.master_key)
        else:
            # Fallback: Simple PBKDF2-like derivation
            key = hashlib.pbkdf2_hmac(
                'sha256',
                self.master_key,
                info,
                100000,
                dklen=self.KEY_SIZE
            )
        
        self._session_keys[session_id] = key
        return key
    
    def encrypt(
        self,
        plaintext: str,
        session_id: str,
        associated_data: Optional[str] = None
    ) -> Optional[EncryptedPayload]:
        """
        Encrypt a message.
        
        Args:
            plaintext: Data to encrypt
            session_id: Session ID (must have derived key)
            associated_data: Additional authenticated data (not encrypted)
            
        Returns:
            EncryptedPayload or None if encryption failed
        """
        key = self._session_keys.get(session_id)
        if not key:
            return None
        
        plaintext_bytes = plaintext.encode('utf-8')
        nonce = os.urandom(self.NONCE_SIZE)
        aad = associated_data.encode('utf-8') if associated_data else None
        
        if crypto_available and aesgcm_cls:
            try:
                aesgcm = aesgcm_cls(key)
                ciphertext = aesgcm.encrypt(nonce, plaintext_bytes, aad)
                
                return EncryptedPayload(
                    ciphertext=base64.b64encode(ciphertext).decode('utf-8'),
                    nonce=base64.b64encode(nonce).decode('utf-8'),
                    tag='',  # GCM tag is included in ciphertext
                    version=self.VERSION
                )
            except Exception:
                return None
        else:
            # Fallback: Simple XOR with HMAC (NOT as secure as AES-GCM)
            # This is for environments without cryptography library
            keystream = self._generate_keystream(key, nonce, len(plaintext_bytes))
            ciphertext = bytes(a ^ b for a, b in zip(plaintext_bytes, keystream))
            
            # Calculate HMAC for authentication
            mac_data = nonce + ciphertext + (aad or b'')
            tag = hmac.new(key, mac_data, hashlib.sha256).digest()
            
            return EncryptedPayload(
                ciphertext=base64.b64encode(ciphertext).decode('utf-8'),
                nonce=base64.b64encode(nonce).decode('utf-8'),
                tag=base64.b64encode(tag).decode('utf-8'),
                version=self.VERSION
            )
    
    def decrypt(
        self,
        payload: EncryptedPayload,
        session_id: str,
        associated_data: Optional[str] = None
    ) -> Optional[str]:
        """
        Decrypt a message.
        
        Args:
            payload: Encrypted payload
            session_id: Session ID (must have derived key)
            associated_data: Additional authenticated data
            
        Returns:
            Decrypted string or None if decryption failed
        """
        key = self._session_keys.get(session_id)
        if not key:
            return None
        
        try:
            ciphertext = base64.b64decode(payload.ciphertext)
            nonce = base64.b64decode(payload.nonce)
            aad = associated_data.encode('utf-8') if associated_data else None
            
            if crypto_available and aesgcm_cls:
                aesgcm = aesgcm_cls(key)
                plaintext = aesgcm.decrypt(nonce, ciphertext, aad)
                return plaintext.decode('utf-8')
            else:
                # Fallback decryption
                tag = base64.b64decode(payload.tag) if payload.tag else None
                
                # Verify HMAC
                if tag:
                    mac_data = nonce + ciphertext + (aad or b'')
                    expected_tag = hmac.new(key, mac_data, hashlib.sha256).digest()
                    if not hmac.compare_digest(tag, expected_tag):
                        return None  # Authentication failed
                
                keystream = self._generate_keystream(key, nonce, len(ciphertext))
                plaintext = bytes(a ^ b for a, b in zip(ciphertext, keystream))
                return plaintext.decode('utf-8')
                
        except Exception:
            return None
    
    def _generate_keystream(
        self,
        key: bytes,
        nonce: bytes,
        length: int
    ) -> bytes:
        """Generate keystream for fallback encryption."""
        keystream = b''
        counter = 0
        
        while len(keystream) < length:
            block_input = key + nonce + counter.to_bytes(4, 'big')
            keystream += hashlib.sha256(block_input).digest()
            counter += 1
        
        return keystream[:length]
    
    def encrypt_location(
        self,
        latitude: float,
        longitude: float,
        session_id: str,
        timestamp: float,
        accuracy: Optional[float] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Encrypt location data.
        
        Args:
            latitude: GPS latitude
            longitude: GPS longitude
            session_id: Encryption session ID
            timestamp: Location timestamp
            accuracy: GPS accuracy (optional)
            
        Returns:
            Dict with encrypted payload or None
        """
        location_data = json.dumps({
            'lat': latitude,
            'lon': longitude,
            'ts': timestamp,
            'acc': accuracy
        })
        
        payload = self.encrypt(
            location_data,
            session_id,
            associated_data=f"location:{timestamp}"
        )
        
        if payload:
            return {
                'encrypted': True,
                'payload': {
                    'ciphertext': payload.ciphertext,
                    'nonce': payload.nonce,
                    'tag': payload.tag,
                    'version': payload.version
                }
            }
        return None
    
    def decrypt_location(
        self,
        encrypted_data: Dict[str, Any],
        session_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Decrypt location data.
        
        Args:
            encrypted_data: Encrypted location payload
            session_id: Encryption session ID
            
        Returns:
            Decrypted location dict or None
        """
        if not encrypted_data.get('encrypted'):
            return encrypted_data
        
        payload_data = encrypted_data.get('payload', {})
        payload = EncryptedPayload(
            ciphertext=payload_data.get('ciphertext', ''),
            nonce=payload_data.get('nonce', ''),
            tag=payload_data.get('tag', ''),
            version=payload_data.get('version', 1)
        )
        
        decrypted = self.decrypt(payload, session_id)
        if decrypted:
            try:
                data = json.loads(decrypted)
                return {
                    'latitude': data['lat'],
                    'longitude': data['lon'],
                    'timestamp': data['ts'],
                    'accuracy': data.get('acc')
                }
            except (json.JSONDecodeError, KeyError):
                return None
        return None
    
    def remove_session_key(self, session_id: str):
        """Remove a session key."""
        if session_id in self._session_keys:
            del self._session_keys[session_id]
    
    def has_session_key(self, session_id: str) -> bool:
        """Check if session key exists."""
        return session_id in self._session_keys


# Singleton instance
_encryption: Optional[E2EEncryption] = None


def get_encryption() -> E2EEncryption:
    """Get or create the E2EEncryption singleton."""
    global _encryption
    if _encryption is None:
        _encryption = E2EEncryption()
    return _encryption
