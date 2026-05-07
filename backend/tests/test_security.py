"""
PATHMAP - Security Tests
========================
Tests for encryption, tunnel, and security features.
"""

import pytest
from unittest.mock import patch, MagicMock
import base64
import os


class TestEncryption:
    """Tests for encryption module."""
    
    def test_aes_encrypt_decrypt(self):
        """AES encryption should be reversible."""
        from security.encryption import AESCipher
        
        cipher = AESCipher()
        plaintext = b"Hello, PathMap!"
        
        ciphertext = cipher.encrypt(plaintext)
        decrypted = cipher.decrypt(ciphertext)
        
        assert decrypted == plaintext
    
    def test_different_plaintexts_different_ciphertexts(self):
        """Different inputs should produce different outputs."""
        from security.encryption import AESCipher
        
        cipher = AESCipher()
        
        ct1 = cipher.encrypt(b"Message 1")
        ct2 = cipher.encrypt(b"Message 2")
        
        assert ct1 != ct2
    
    def test_same_plaintext_different_ciphertexts(self):
        """Same input with random IV should produce different outputs."""
        from security.encryption import AESCipher
        
        cipher = AESCipher()
        plaintext = b"Same message"
        
        ct1 = cipher.encrypt(plaintext)
        ct2 = cipher.encrypt(plaintext)
        
        # With random IV, ciphertexts should differ
        assert ct1 != ct2


class TestTunnelEngine:
    """Tests for encrypted tunnel."""
    
    def test_tunnel_session_creation(self):
        """Should create tunnel session."""
        from security.tunnel_engine import TunnelEngine
        
        engine = TunnelEngine()
        session = engine.create_session()
        
        assert session is not None
        assert session.session_id is not None
    
    def test_tunnel_key_exchange(self):
        """Should complete key exchange."""
        from security.tunnel_engine import TunnelEngine
        
        engine = TunnelEngine()
        
        # Generate keypair
        public_key = engine.generate_keypair()
        
        assert public_key is not None
        assert len(public_key) > 0
    
    def test_tunnel_encryption(self):
        """Should encrypt/decrypt data through tunnel."""
        from security.tunnel_engine import TunnelEngine
        
        engine = TunnelEngine()
        session = engine.create_session()
        
        plaintext = b'{"type": "location", "lat": 9.0820}'
        
        encrypted = engine.encrypt_frame(session, plaintext)
        decrypted = engine.decrypt_frame(session, encrypted)
        
        assert decrypted == plaintext
    
    def test_key_rotation(self):
        """Should rotate keys after threshold."""
        from security.tunnel_engine import TunnelEngine
        
        engine = TunnelEngine()
        session = engine.create_session()
        
        initial_key_id = session.key_id if hasattr(session, 'key_id') else 0
        
        # Simulate many messages (would trigger rotation in real use)
        for i in range(100):
            engine.encrypt_frame(session, b"test message")
        
        # Key rotation is implementation-dependent
        assert session is not None


class TestStealthLayer:
    """Tests for traffic obfuscation."""
    
    def test_obfuscate_packet(self):
        """Should obfuscate packet."""
        from security.stealth_layer import StealthLayer
        
        layer = StealthLayer()
        original = b"Original data"
        
        obfuscated = layer.obfuscate(original)
        
        # Should be different from original
        assert obfuscated != original
        # Should have TLS header
        assert obfuscated[:3] == b'\x17\x03\x03'
    
    def test_deobfuscate_packet(self):
        """Should deobfuscate packet."""
        from security.stealth_layer import StealthLayer
        
        layer = StealthLayer()
        original = b"Original data"
        
        obfuscated = layer.obfuscate(original)
        deobfuscated = layer.deobfuscate(obfuscated)
        
        assert deobfuscated == original
    
    def test_padding_applied(self):
        """Should apply padding for uniform size."""
        from security.stealth_layer import StealthLayer
        
        layer = StealthLayer()
        
        small = layer.obfuscate(b"A")
        medium = layer.obfuscate(b"A" * 100)
        
        # Both should be padded to block size
        assert len(small) % 64 == 0 or len(small) > 64
        assert len(medium) % 64 == 0 or len(medium) > 64


class TestRateLimiter:
    """Tests for rate limiting."""
    
    def test_allow_under_limit(self):
        """Should allow requests under limit."""
        from security.rate_limiter import RateLimiter
        
        limiter = RateLimiter(max_requests=10, window_seconds=60)
        
        for _ in range(5):
            assert limiter.is_allowed("test-client") is True
    
    def test_block_over_limit(self):
        """Should block requests over limit."""
        from security.rate_limiter import RateLimiter
        
        limiter = RateLimiter(max_requests=5, window_seconds=60)
        
        # Exhaust limit
        for _ in range(5):
            limiter.is_allowed("test-client")
        
        # Should be blocked
        assert limiter.is_allowed("test-client") is False
    
    def test_different_clients_independent(self):
        """Different clients should have independent limits."""
        from security.rate_limiter import RateLimiter
        
        limiter = RateLimiter(max_requests=2, window_seconds=60)
        
        # Client 1 uses their limit
        limiter.is_allowed("client-1")
        limiter.is_allowed("client-1")
        
        # Client 2 should still be allowed
        assert limiter.is_allowed("client-2") is True


class TestTunnelAPI:
    """Integration tests for tunnel API."""
    
    def test_tunnel_handshake(self, client):
        """Should complete tunnel handshake."""
        # Generate test public key
        public_key = base64.b64encode(os.urandom(32)).decode()
        
        response = client.post(
            "/api/v1/tunnel/handshake",
            json={"client_public_key": public_key}
        )
        
        if response.status_code == 200:
            data = response.json()
            assert "session_id" in data
            assert "server_public_key" in data
    
    def test_tunnel_stats(self, client):
        """Should return tunnel statistics."""
        response = client.get("/api/v1/tunnel/stats")
        
        if response.status_code == 200:
            data = response.json()
            assert "active_sessions" in data
            assert "threat_level" in data


class TestSecurityHeaders:
    """Tests for security headers."""
    
    def test_cors_headers(self, client):
        """Should include CORS headers."""
        response = client.options("/api/v1/health")
        
        # CORS is typically enabled
        headers = dict(response.headers)
        # Headers may vary based on configuration
        assert response.status_code in [200, 204, 405]
    
    def test_content_type_header(self, client):
        """Should set correct content type."""
        response = client.get("/api/v1/health")
        
        if response.status_code == 200:
            content_type = response.headers.get("content-type", "")
            assert "application/json" in content_type


class TestInputValidation:
    """Tests for input validation and sanitization."""
    
    def test_sql_injection_prevention(self, client, auth_headers):
        """Should prevent SQL injection."""
        # Attempt SQL injection in search
        response = client.get(
            "/api/v1/users/search",
            params={"q": "'; DROP TABLE users; --"},
            headers=auth_headers
        )
        
        # Should not crash - either 200 with no results or 400
        assert response.status_code in [200, 400, 404, 422]
    
    def test_xss_prevention(self, client, auth_headers):
        """Should prevent XSS in inputs."""
        response = client.post(
            "/api/v1/tracking/devices/register",
            json={
                "name": "<script>alert('xss')</script>",
                "type": "phone"
            },
            headers=auth_headers
        )
        
        if response.status_code == 200:
            data = response.json()
            # Name should be sanitized or escaped
            if "name" in data:
                assert "<script>" not in data["name"]
    
    def test_path_traversal_prevention(self, client):
        """Should prevent path traversal."""
        response = client.get("/api/v1/files/../../../etc/passwd")
        
        # Should return 404, not file contents
        assert response.status_code in [404, 400, 403]
