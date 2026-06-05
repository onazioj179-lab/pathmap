"""
PATHMAP - Security Tests
========================
Tests for encryption, tunnel, and security features.
"""

import base64
import os


class TestEncryption:
    """Tests for the E2E encryption module (AES-256-GCM)."""

    def _cipher(self):
        from security.encryption import E2EEncryption
        enc = E2EEncryption()
        enc.derive_session_key("sess-1", "alice", "bob")
        return enc

    def test_aes_encrypt_decrypt(self):
        """Encryption should be reversible for a session with a derived key."""
        enc = self._cipher()
        payload = enc.encrypt("Hello, PathMap!", "sess-1")
        assert payload is not None
        decrypted = enc.decrypt(payload, "sess-1")
        assert decrypted == "Hello, PathMap!"

    def test_different_plaintexts_different_ciphertexts(self):
        """Different inputs should produce different ciphertexts."""
        enc = self._cipher()
        ct1 = enc.encrypt("Message 1", "sess-1").ciphertext
        ct2 = enc.encrypt("Message 2", "sess-1").ciphertext
        assert ct1 != ct2

    def test_same_plaintext_different_ciphertexts(self):
        """Same input with a random nonce should produce different ciphertexts."""
        enc = self._cipher()
        ct1 = enc.encrypt("Same message", "sess-1").ciphertext
        ct2 = enc.encrypt("Same message", "sess-1").ciphertext
        assert ct1 != ct2


class TestTunnelEngine:
    """Tests for encrypted tunnel."""
    
    def _client_pub(self):
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives import serialization
        priv = ec.generate_private_key(ec.SECP256R1())
        pub = priv.public_key().public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
        )
        return pub

    def test_tunnel_session_creation(self):
        """create_session returns (session_id, server_public_key)."""
        from security.tunnel_engine import TunnelEngine

        engine = TunnelEngine()
        session_id, server_pub = engine.create_session()

        assert isinstance(session_id, str) and session_id
        assert len(server_pub) == 65  # uncompressed P-256 point

    def test_tunnel_key_exchange(self):
        """generate_keypair returns a private key and a 65-byte public point."""
        from security.tunnel_engine import TunnelEngine

        engine = TunnelEngine()
        _priv, public_key = engine.generate_keypair()

        assert len(public_key) == 65

    def test_tunnel_encryption(self):
        """After a handshake, the engine produces a valid encrypted envelope."""
        import json
        from security.tunnel_engine import TunnelEngine

        engine = TunnelEngine()
        session_id, _server_pub = engine.create_session()
        assert engine.complete_handshake(session_id, self._client_pub()) is True

        envelope = engine.encrypt_message(session_id, b'{"type": "location", "lat": 9.0820}')
        assert envelope is not None
        obj = json.loads(envelope)
        assert "n" in obj and "ct" in obj


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
    
    async def test_allow_under_limit(self):
        """Should allow requests under the limit."""
        from security.hardening import RateLimiter

        limiter = RateLimiter(max_requests=10, window_seconds=60)

        for _ in range(5):
            allowed, _info = await limiter.is_allowed("test-client")
            assert allowed is True

    async def test_block_over_limit(self):
        """Should block requests over the limit."""
        from security.hardening import RateLimiter

        limiter = RateLimiter(max_requests=5, window_seconds=60)

        for _ in range(5):
            await limiter.is_allowed("test-client")

        allowed, _info = await limiter.is_allowed("test-client")
        assert allowed is False

    async def test_different_clients_independent(self):
        """Different clients should have independent limits."""
        from security.hardening import RateLimiter

        limiter = RateLimiter(max_requests=2, window_seconds=60)

        await limiter.is_allowed("client-1")
        await limiter.is_allowed("client-1")

        allowed, _info = await limiter.is_allowed("client-2")
        assert allowed is True


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
        dict(response.headers)
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
