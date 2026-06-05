"""
PATHMAP - Authentication Tests
==============================
Unit tests for auth module: registration, login, JWT, sessions.
"""

import pytest


class TestPasswordUtils:
    """Tests for password hashing and verification."""
    
    def test_hash_password_returns_salted_hash(self):
        """hash_password returns a self-describing 'salt$iterations$hash' string."""
        from auth.password_utils import PasswordUtils

        hashed = PasswordUtils.hash_password("SecurePass123!")

        assert isinstance(hashed, str)
        parts = hashed.split("$")
        assert len(parts) == 3  # salt$iterations$hash
        assert int(parts[1]) > 0  # iteration count

    def test_hash_password_is_salted(self):
        """Hashing the same password twice yields different stored hashes."""
        from auth.password_utils import PasswordUtils

        assert PasswordUtils.hash_password("x") != PasswordUtils.hash_password("x")

    def test_verify_password_correct(self):
        """Correct password should verify successfully."""
        from auth.password_utils import PasswordUtils

        password = "SecurePass123!"
        hashed = PasswordUtils.hash_password(password)

        assert PasswordUtils.verify_password(password, hashed) is True

    def test_verify_password_incorrect(self):
        """Incorrect password should fail verification."""
        from auth.password_utils import PasswordUtils

        hashed = PasswordUtils.hash_password("SecurePass123!")

        assert PasswordUtils.verify_password("WrongPassword", hashed) is False


class TestJWTHandler:
    """Tests for JWT token handling."""
    
    def test_create_access_token(self):
        """Access token creation should work."""
        from auth.jwt_handler import get_jwt_handler
        
        handler = get_jwt_handler()
        token = handler.create_access_token(
            user_id="test-123",
            username="testuser"
        )
        
        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 50  # JWT tokens are long
    
    def test_create_refresh_token(self):
        """Refresh token creation should work."""
        from auth.jwt_handler import get_jwt_handler
        
        handler = get_jwt_handler()
        token = handler.create_refresh_token(user_id="test-123")
        
        assert token is not None
        assert isinstance(token, str)
    
    def test_verify_valid_token(self):
        """Valid token should verify successfully."""
        from auth.jwt_handler import get_jwt_handler
        
        handler = get_jwt_handler()
        token = handler.create_access_token(
            user_id="test-123",
            username="testuser"
        )
        
        payload = handler.verify_token(token)
        
        assert payload is not None
        assert payload["sub"] == "test-123"
        assert payload["username"] == "testuser"
    
    def test_verify_invalid_token(self):
        """Invalid token should fail verification."""
        from auth.jwt_handler import get_jwt_handler
        
        handler = get_jwt_handler()
        payload = handler.verify_token("invalid.token.here")
        
        assert payload is None
    
    def test_verify_expired_token(self):
        """Expired token should fail verification."""
        from auth.jwt_handler import get_jwt_handler
        
        handler = get_jwt_handler()
        # Create token that expires immediately
        token = handler.create_access_token(
            user_id="test-123",
            username="testuser",
            expires_delta=-1  # Expired
        )
        
        payload = handler.verify_token(token)
        assert payload is None


class TestAuthCore:
    """Tests for core authentication logic."""
    
    @pytest.fixture
    def auth_core(self, temp_db):
        """Create AuthCore with temp database."""
        from auth.auth_core import AuthCore
        return AuthCore(db_path=temp_db)
    
    def test_register_new_user(self, auth_core):
        """New user registration should succeed."""
        success, message, user = auth_core.register(
            username="newuser",
            email="new@test.com",
            password="SecurePass123!",
            display_name="New User"
        )
        
        assert success is True
        assert user is not None
        assert user.username == "newuser"
        assert user.email == "new@test.com"
    
    def test_register_duplicate_username(self, auth_core):
        """Duplicate username registration should fail."""
        # First registration
        auth_core.register(
            username="duplicate",
            email="first@test.com",
            password="SecurePass123!"
        )
        
        # Second registration with same username
        success, message, user = auth_core.register(
            username="duplicate",
            email="second@test.com",
            password="SecurePass123!"
        )
        
        assert success is False
        assert message  # a human-readable reason is returned

    def test_register_duplicate_email(self, auth_core):
        """Duplicate email registration should fail."""
        # First registration
        auth_core.register(
            username="user1",
            email="same@test.com",
            password="SecurePass123!"
        )
        
        # Second registration with same email
        success, message, user = auth_core.register(
            username="user2",
            email="same@test.com",
            password="SecurePass123!"
        )
        
        assert success is False
        assert message  # a human-readable reason is returned

    def test_login_valid_credentials(self, auth_core):
        """Login with valid credentials should succeed."""
        # Register user
        auth_core.register(
            username="logintest",
            email="login@test.com",
            password="SecurePass123!"
        )
        
        # Login
        success, message, result = auth_core.login(
            identifier="logintest",
            password="SecurePass123!"
        )
        
        assert success is True
        assert result is not None
        assert "access_token" in result
    
    def test_login_invalid_password(self, auth_core):
        """Login with wrong password should fail."""
        # Register user
        auth_core.register(
            username="wrongpass",
            email="wrong@test.com",
            password="SecurePass123!"
        )
        
        # Login with wrong password
        success, message, result = auth_core.login(
            identifier="wrongpass",
            password="WrongPassword!"
        )
        
        assert success is False
        assert result is None
    
    def test_login_nonexistent_user(self, auth_core):
        """Login with nonexistent user should fail."""
        success, message, result = auth_core.login(
            identifier="nonexistent",
            password="AnyPassword123!"
        )
        
        assert success is False
        assert result is None


class TestAuthAPI:
    """Integration tests for auth API endpoints."""
    
    def test_register_endpoint(self, client):
        """POST /api/v1/social/auth/register should create a user."""
        import secrets
        uid = secrets.token_hex(4)  # unique so reruns don't collide in the user DB
        response = client.post(
            "/api/v1/social/auth/register",
            json={
                "username": f"apitest_{uid}",
                "email": f"api_{uid}@test.com",
                "password": "SecurePass123!",
                "display_name": "API Test User"
            }
        )

        assert response.status_code in [200, 201]
        data = response.json()
        assert data.get("success") is True or "access_token" in data

    def test_login_endpoint(self, client):
        """POST /api/v1/social/auth/login should authenticate a user."""
        import secrets
        uid = secrets.token_hex(4)
        username = f"loginapi_{uid}"
        client.post(
            "/api/v1/social/auth/register",
            json={
                "username": username,
                "email": f"loginapi_{uid}@test.com",
                "password": "SecurePass123!"
            }
        )

        response = client.post(
            "/api/v1/social/auth/login",
            json={"identifier": username, "password": "SecurePass123!"}
        )

        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data or data.get("success") is True

    def test_protected_endpoint_without_token(self, client):
        """Protected endpoint without a token should be rejected."""
        # /auth/me is a GET protected by the bearer-token dependency.
        response = client.get("/api/v1/social/auth/me")

        assert response.status_code in [401, 403, 422]

    def test_protected_endpoint_with_token(self, client, auth_headers):
        """Protected endpoint with a valid token should be reachable."""
        response = client.get("/api/v1/social/auth/me", headers=auth_headers)

        # 200 if the user record exists, 404 if not present in the test DB.
        assert response.status_code in [200, 404]
