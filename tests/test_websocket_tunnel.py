"""
PATHMAP - WebSocket Tunnel Tests
================================
Integration tests for WebSocket tunnel with backpressure handling.
"""

import pytest
import asyncio
import json
import base64
import time
import sys
import os
from unittest.mock import MagicMock, AsyncMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))


class TestTunnelConnection:
    """Test TunnelConnection dataclass and queue behavior."""
    
    def test_connection_import(self):
        """Test that tunnel API imports correctly."""
        from api.tunnel_api import (
            TunnelConnection,
            MAX_QUEUE_SIZE,
            MAX_CONNECTIONS_PER_USER,
            MAX_TOTAL_CONNECTIONS,
            HEARTBEAT_TIMEOUT
        )
        
        assert MAX_QUEUE_SIZE == 1000
        assert MAX_CONNECTIONS_PER_USER == 5
        assert MAX_TOTAL_CONNECTIONS == 10000
        assert HEARTBEAT_TIMEOUT == 90
    
    @pytest.mark.asyncio
    async def test_connection_creation(self):
        """Test creating a TunnelConnection."""
        from api.tunnel_api import TunnelConnection, MAX_QUEUE_SIZE
        
        mock_ws = AsyncMock()
        
        conn = TunnelConnection(
            websocket=mock_ws,
            session_id="test-session-123",
            user_id="test-user-456"
        )
        
        assert conn.session_id == "test-session-123"
        assert conn.user_id == "test-user-456"
        assert conn.is_healthy is True
        assert conn.messages_sent == 0
        assert conn.messages_dropped == 0
        assert conn.queue.maxsize == MAX_QUEUE_SIZE


class TestBackpressureQueue:
    """Test backpressure queue functionality."""
    
    @pytest.mark.asyncio
    async def test_queue_accepts_messages(self):
        """Test that queue accepts messages within limit."""
        from api.tunnel_api import TunnelConnection, enqueue_message
        
        mock_ws = AsyncMock()
        conn = TunnelConnection(
            websocket=mock_ws,
            session_id="test-session",
            user_id="test-user"
        )
        
        # Should accept messages
        success = await enqueue_message(conn, b"test message")
        assert success is True
        assert conn.queue.qsize() == 1
    
    @pytest.mark.asyncio
    async def test_queue_drops_when_full(self):
        """Test that queue drops messages when full."""
        from api.tunnel_api import TunnelConnection, enqueue_message
        
        mock_ws = AsyncMock()
        
        # Create connection with small queue for testing
        conn = TunnelConnection(
            websocket=mock_ws,
            session_id="test-session",
            user_id="test-user"
        )
        
        # Replace queue with smaller one for testing
        conn.queue = asyncio.Queue(maxsize=5)
        
        # Fill the queue
        for i in range(5):
            await conn.queue.put(f"message-{i}".encode())
        
        # Next message should be dropped
        success = await enqueue_message(conn, b"overflow message")
        assert success is False
        assert conn.messages_dropped == 1


class TestConnectionLimits:
    """Test connection limit enforcement."""
    
    @pytest.mark.asyncio
    async def test_check_connection_limits_allows_first(self):
        """Test that first connection is allowed."""
        from api.tunnel_api import (
            check_connection_limits,
            active_tunnels,
            user_connections
        )
        
        # Clear any existing connections
        active_tunnels.clear()
        user_connections.clear()
        
        allowed = await check_connection_limits(user_id="new-user")
        assert allowed is True
    
    @pytest.mark.asyncio
    async def test_per_user_limit_enforced(self):
        """Test that per-user connection limit is enforced."""
        from api.tunnel_api import (
            check_connection_limits,
            register_connection,
            unregister_connection,
            TunnelConnection,
            MAX_CONNECTIONS_PER_USER,
            active_tunnels,
            user_connections
        )
        
        # Clear existing
        active_tunnels.clear()
        user_connections.clear()
        
        test_user = "limit-test-user"
        mock_ws = AsyncMock()
        
        # Register connections up to limit
        for i in range(MAX_CONNECTIONS_PER_USER):
            conn = TunnelConnection(
                websocket=mock_ws,
                session_id=f"session-{i}",
                user_id=test_user
            )
            register_connection(conn)
        
        # Check limit - should be denied
        allowed = await check_connection_limits(user_id=test_user)
        assert allowed is False
        
        # Clean up
        for i in range(MAX_CONNECTIONS_PER_USER):
            unregister_connection(f"session-{i}")


class TestConnectionRegistry:
    """Test connection registration and unregistration."""
    
    @pytest.mark.asyncio
    async def test_register_connection(self):
        """Test registering a connection."""
        from api.tunnel_api import (
            register_connection,
            unregister_connection,
            TunnelConnection,
            active_tunnels,
            user_connections
        )
        
        # Clear existing
        active_tunnels.clear()
        user_connections.clear()
        
        mock_ws = AsyncMock()
        conn = TunnelConnection(
            websocket=mock_ws,
            session_id="reg-test-session",
            user_id="reg-test-user"
        )
        
        register_connection(conn)
        
        assert "reg-test-session" in active_tunnels
        assert "reg-test-user" in user_connections
        assert "reg-test-session" in user_connections["reg-test-user"]
        
        # Clean up
        unregister_connection("reg-test-session")
    
    @pytest.mark.asyncio
    async def test_unregister_connection(self):
        """Test unregistering a connection."""
        from api.tunnel_api import (
            register_connection,
            unregister_connection,
            TunnelConnection,
            active_tunnels,
            user_connections
        )
        
        # Clear existing
        active_tunnels.clear()
        user_connections.clear()
        
        mock_ws = AsyncMock()
        conn = TunnelConnection(
            websocket=mock_ws,
            session_id="unreg-test-session",
            user_id="unreg-test-user"
        )
        
        register_connection(conn)
        unregister_connection("unreg-test-session")
        
        assert "unreg-test-session" not in active_tunnels
        # User entry should be removed if empty
        assert "unreg-test-user" not in user_connections or \
               "unreg-test-session" not in user_connections.get("unreg-test-user", [])


class TestTunnelStats:
    """Test tunnel statistics endpoint."""
    
    def test_stats_model(self):
        """Test TunnelStatsResponse model."""
        from api.tunnel_api import TunnelStatsResponse
        
        stats = TunnelStatsResponse(
            active_sessions=5,
            total_bytes_transferred=1024000,
            threat_level="NONE",
            security_report={"status": "ok"}
        )
        
        assert stats.active_sessions == 5
        assert stats.total_bytes_transferred == 1024000


class TestSendToTunnel:
    """Test send_to_tunnel function."""
    
    @pytest.mark.asyncio
    async def test_send_to_nonexistent_tunnel(self):
        """Test sending to non-existent tunnel returns False."""
        from api.tunnel_api import send_to_tunnel, active_tunnels
        
        active_tunnels.clear()
        
        result = await send_to_tunnel("nonexistent-session", {"type": "test"})
        assert result is False
    
    @pytest.mark.asyncio
    async def test_send_to_unhealthy_tunnel(self):
        """Test sending to unhealthy tunnel returns False."""
        from api.tunnel_api import (
            send_to_tunnel,
            register_connection,
            unregister_connection,
            TunnelConnection,
            active_tunnels
        )
        
        active_tunnels.clear()
        
        mock_ws = AsyncMock()
        conn = TunnelConnection(
            websocket=mock_ws,
            session_id="unhealthy-session",
            user_id="test-user"
        )
        conn.is_healthy = False
        
        register_connection(conn)
        
        result = await send_to_tunnel("unhealthy-session", {"type": "test"})
        assert result is False
        
        unregister_connection("unhealthy-session")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
