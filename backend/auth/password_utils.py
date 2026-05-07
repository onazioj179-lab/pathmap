"""
PATHMAP - Password Security Utilities
=====================================
Secure password hashing and verification using PBKDF2.
Pure Python implementation for long-term stability.
"""

import hashlib
import secrets
import hmac
# Type imports for future use


class PasswordUtils:
    """
    Secure password hashing using PBKDF2-HMAC-SHA256.
    
    Uses Python stdlib only for 20+ year stability.
    PBKDF2 is NIST approved and will remain secure.
    """
    
    # PBKDF2 iterations - high for security, adjustable
    ITERATIONS = 200_000
    SALT_LENGTH = 32
    HASH_LENGTH = 64
    
    @staticmethod
    def hash_password(password: str) -> str:
        """
        Hash a password with a random salt.
        
        Args:
            password: Plain text password
            
        Returns:
            Format: "salt$iterations$hash" (all hex encoded)
        """
        # Generate cryptographically secure random salt
        salt = secrets.token_bytes(PasswordUtils.SALT_LENGTH)
        
        # Hash password using PBKDF2
        password_hash = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode('utf-8'),
            salt,
            PasswordUtils.ITERATIONS,
            dklen=PasswordUtils.HASH_LENGTH
        )
        
        # Return as "salt$iterations$hash"
        return f"{salt.hex()}${PasswordUtils.ITERATIONS}${password_hash.hex()}"
    
    @staticmethod
    def verify_password(password: str, stored_hash: str) -> bool:
        """
        Verify a password against a stored hash.
        
        Args:
            password: Plain text password to verify
            stored_hash: Previously stored hash string
            
        Returns:
            True if password matches, False otherwise
        """
        try:
            parts = stored_hash.split('$')
            if len(parts) != 3:
                return False
            
            salt_hex, iterations_str, hash_hex = parts
            salt = bytes.fromhex(salt_hex)
            iterations = int(iterations_str)
            stored_password_hash = bytes.fromhex(hash_hex)
            
            # Compute hash with same parameters
            computed_hash = hashlib.pbkdf2_hmac(
                'sha256',
                password.encode('utf-8'),
                salt,
                iterations,
                dklen=len(stored_password_hash)
            )
            
            # Constant-time comparison to prevent timing attacks
            return hmac.compare_digest(computed_hash, stored_password_hash)
            
        except (ValueError, TypeError):
            return False
    
    @staticmethod
    def generate_secure_token(length: int = 32) -> str:
        """Generate a cryptographically secure random token."""
        return secrets.token_urlsafe(length)
    
    @staticmethod
    def generate_verification_code(length: int = 6) -> str:
        """Generate a numeric verification code for email/phone."""
        return ''.join(str(secrets.randbelow(10)) for _ in range(length))
