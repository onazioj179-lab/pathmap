"""
PATHMAP - Secure Tunnel API
===========================
E2E encrypted WebSocket tunnel with backpressure handling.
All data travels through encrypted tunnel with stealth obfuscation.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.security import HTTPBearer
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import json
import base64
import asyncio
import time
import logging
from dataclasses import dataclass, field

from security.tunnel_engine import get_tunnel_engine, TunnelState, ThreatLevel
from security.stealth_layer import get_stealth_layer, StealthMode

router = APIRouter(prefix="/api/v1/tunnel", tags=["secure-tunnel"])
security = HTTPBearer(auto_error=False)
logger = logging.getLogger("SecureTunnel")

tunnel_engine = get_tunnel_engine()
stealth_layer = get_stealth_layer()

# ============== BACKPRESSURE CONFIGURATION ==============

MAX_QUEUE_SIZE = 1000  # Max messages per connection queue
MAX_CONNECTIONS_PER_USER = 5  # Max concurrent tunnel connections per user
MAX_TOTAL_CONNECTIONS = 10000  # Global connection limit
HEARTBEAT_INTERVAL = 30  # Seconds between heartbeats
HEARTBEAT_TIMEOUT = 90  # Seconds before considering connection dead
MESSAGE_TIMEOUT = 5.0  # Seconds to wait for send to complete


@dataclass
class TunnelConnection:
    """Represents an active tunnel connection with backpressure."""
    websocket: WebSocket
    session_id: str
    user_id: Optional[str] = None
    queue: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=MAX_QUEUE_SIZE))
    last_heartbeat: float = field(default_factory=time.time)
    connected_at: float = field(default_factory=time.time)
    messages_sent: int = 0
    messages_dropped: int = 0
    bytes_sent: int = 0
    is_healthy: bool = True
    _sender_task: Optional[asyncio.Task] = None


# Connection registry with backpressure tracking
active_tunnels: Dict[str, TunnelConnection] = {}
user_connections: Dict[str, List[str]] = {}  # user_id -> [session_ids]


class TunnelHandshakeRequest(BaseModel):
    client_public_key: str


class TunnelHandshakeResponse(BaseModel):
    session_id: str
    server_public_key: str
    stealth_mode: str


class TunnelStatsResponse(BaseModel):
    active_sessions: int
    total_bytes_transferred: int
    threat_level: str
    security_report: Dict[str, Any]


# ============== BACKPRESSURE HELPERS ==============

async def check_connection_limits(user_id: Optional[str] = None) -> bool:
    """Check if new connection is allowed based on limits."""
    # Global limit
    if len(active_tunnels) >= MAX_TOTAL_CONNECTIONS:
        logger.warning(f"Global connection limit reached ({MAX_TOTAL_CONNECTIONS})")
        return False
    
    # Per-user limit
    if user_id and user_id in user_connections:
        if len(user_connections[user_id]) >= MAX_CONNECTIONS_PER_USER:
            logger.warning(f"User {user_id[:8]} connection limit reached ({MAX_CONNECTIONS_PER_USER})")
            return False
    
    return True


async def sender_loop(conn: TunnelConnection):
    """Background task to send queued messages with backpressure."""
    try:
        while conn.is_healthy:
            try:
                # Wait for message with timeout
                data = await asyncio.wait_for(conn.queue.get(), timeout=HEARTBEAT_INTERVAL)
                
                # Send with timeout to detect slow consumers
                try:
                    await asyncio.wait_for(
                        conn.websocket.send_text(data),
                        timeout=MESSAGE_TIMEOUT
                    )
                    conn.messages_sent += 1
                    conn.bytes_sent += len(data)
                except asyncio.TimeoutError:
                    conn.messages_dropped += 1
                    logger.warning(f"Slow consumer {conn.session_id[:8]}, dropped message")
                    
            except asyncio.TimeoutError:
                # No message, check heartbeat
                if time.time() - conn.last_heartbeat > HEARTBEAT_TIMEOUT:
                    logger.info(f"Heartbeat timeout for {conn.session_id[:8]}")
                    conn.is_healthy = False
                    break
                    
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.error(f"Sender loop error for {conn.session_id[:8]}: {e}")
        conn.is_healthy = False


async def enqueue_message(conn: TunnelConnection, data: str) -> bool:
    """
    Enqueue an encrypted JSON-envelope string with backpressure handling.
    Returns False if queue is full (message dropped).
    """
    try:
        conn.queue.put_nowait(data)
        return True
    except asyncio.QueueFull:
        conn.messages_dropped += 1
        logger.warning(f"Queue full for {conn.session_id[:8]}, dropped message")
        return False


def register_connection(conn: TunnelConnection):
    """Register a new tunnel connection."""
    active_tunnels[conn.session_id] = conn
    
    if conn.user_id:
        if conn.user_id not in user_connections:
            user_connections[conn.user_id] = []
        user_connections[conn.user_id].append(conn.session_id)


def unregister_connection(session_id: str):
    """Unregister a tunnel connection."""
    if session_id in active_tunnels:
        conn = active_tunnels[session_id]
        
        # Cancel sender task
        if conn._sender_task:
            conn._sender_task.cancel()
        
        # Remove from user connections
        if conn.user_id and conn.user_id in user_connections:
            user_connections[conn.user_id] = [
                s for s in user_connections[conn.user_id] if s != session_id
            ]
            if not user_connections[conn.user_id]:
                del user_connections[conn.user_id]
        
        del active_tunnels[session_id]


@router.post("/handshake", response_model=TunnelHandshakeResponse)
async def initiate_handshake(request: TunnelHandshakeRequest):
    """
    Initiate encrypted tunnel handshake.
    Client sends public key, server responds with session ID and server public key.
    """
    try:
        client_pub_key = base64.b64decode(request.client_public_key)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 public key")

    # P-256 uncompressed public point is 65 bytes (0x04 || X(32) || Y(32)).
    if len(client_pub_key) != 65 or client_pub_key[0] != 0x04:
        raise HTTPException(status_code=400, detail="Invalid key length or format (expected 65-byte uncompressed P-256 point)")

    try:
        session_id, server_pub_key = tunnel_engine.create_session()
        success = tunnel_engine.complete_handshake(session_id, client_pub_key)
        if not success:
            raise HTTPException(status_code=500, detail="Handshake failed")

        logger.info(f"Tunnel handshake complete: {session_id[:8]}...")
        return TunnelHandshakeResponse(
            session_id=session_id,
            server_public_key=base64.b64encode(server_pub_key).decode(),
            stealth_mode=stealth_layer.config.mode.name
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Handshake error: {e}")
        raise HTTPException(status_code=500, detail="Handshake failed")


@router.websocket("/ws/{session_id}")
async def tunnel_websocket(websocket: WebSocket, session_id: str):
    """
    Encrypted WebSocket tunnel endpoint with backpressure handling.
    All messages are encrypted with AES-256-GCM and obfuscated.
    """
    session = tunnel_engine.sessions.get(session_id)
    if not session or session.state != TunnelState.ESTABLISHED:
        await websocket.close(code=4001, reason="Invalid session")
        return
    
    # Check connection limits
    user_id = getattr(session, 'user_id', None)
    if not await check_connection_limits(user_id):
        await websocket.close(code=4029, reason="Connection limit exceeded")
        return
    
    await websocket.accept()
    
    # Create connection with backpressure queue
    conn = TunnelConnection(
        websocket=websocket,
        session_id=session_id,
        user_id=user_id
    )
    register_connection(conn)
    
    # Start sender loop for outbound messages
    conn._sender_task = asyncio.create_task(sender_loop(conn))
    
    logger.info(f"Tunnel connected: {session_id[:8]}... (queue_size={MAX_QUEUE_SIZE})")
    
    try:
        while conn.is_healthy:
            try:
                raw_text = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=HEARTBEAT_INTERVAL
                )
            except asyncio.TimeoutError:
                # Check heartbeat timeout
                if time.time() - conn.last_heartbeat > HEARTBEAT_TIMEOUT:
                    logger.info(f"Heartbeat timeout for {session_id[:8]}")
                    break
                continue

            conn.last_heartbeat = time.time()

            # Each message is a JSON envelope {"n","ct"} encrypted with AES-256-GCM.
            plaintext = tunnel_engine.decrypt_message(session_id, raw_text)
            if plaintext is None:
                logger.warning(f"Decryption failed for {session_id[:8]}")
                continue

            # Inner plaintext is a JSON app message; route by its "type".
            try:
                inner = json.loads(plaintext.decode())
                inner_type = inner.get("type", "")
            except Exception:
                inner_type = ""

            if inner_type == "heartbeat" or inner_type == "ping":
                response = await _handle_heartbeat(session_id)
            elif inner_type == "close":
                break
            else:
                response = await _handle_data(session_id, plaintext)

            if response:
                envelope = tunnel_engine.encrypt_message(session_id, response)
                if envelope:
                    await enqueue_message(conn, envelope)

    except WebSocketDisconnect:
        logger.info(f"Tunnel disconnected: {session_id[:8]}...")
    except Exception as e:
        logger.error(f"Tunnel error: {e}")
    finally:
        unregister_connection(session_id)
        tunnel_engine.close_session(session_id)
        
        # Log connection stats
        logger.info(
            f"Tunnel {session_id[:8]} closed: "
            f"sent={conn.messages_sent}, dropped={conn.messages_dropped}, "
            f"bytes={conn.bytes_sent}"
        )


async def _handle_heartbeat(session_id: str) -> bytes:
    """Handle heartbeat frame"""
    return json.dumps({
        "type": "heartbeat_ack",
        "timestamp": time.time(),
        "session": session_id[:8]
    }).encode()


async def _handle_data(session_id: str, data: bytes) -> Optional[bytes]:
    """Handle data frame - route to appropriate handler"""
    try:
        message = json.loads(data.decode())
        msg_type = message.get("type", "")
        
        if msg_type == "location_update":
            return await _handle_location_update(session_id, message)
        elif msg_type == "tracking_request":
            return await _handle_tracking_request(session_id, message)
        elif msg_type == "ping":
            return json.dumps({"type": "pong", "timestamp": time.time()}).encode()
        else:
            return json.dumps({"type": "ack", "received": msg_type}).encode()
            
    except Exception as e:
        logger.error(f"Data handling error: {e}")
        return json.dumps({"type": "error", "message": str(e)}).encode()


async def _handle_location_update(session_id: str, message: Dict) -> bytes:
    """Process encrypted location update"""
    location = message.get("location", {})
    
    logger.debug(f"Received encrypted location from {session_id[:8]}: {location.get('lat')}, {location.get('lng')}")
    
    return json.dumps({
        "type": "location_ack",
        "timestamp": time.time(),
        "received": True
    }).encode()


async def _handle_tracking_request(session_id: str, message: Dict) -> bytes:
    """Process tracking request through tunnel"""
    target_id = message.get("target_id")
    
    return json.dumps({
        "type": "tracking_response",
        "target_id": target_id,
        "status": "tracking_active",
        "timestamp": time.time()
    }).encode()


@router.get("/stats", response_model=TunnelStatsResponse)
async def get_tunnel_stats():
    """Get tunnel statistics and security report"""
    total_bytes = sum(
        s.bytes_sent + s.bytes_received 
        for s in tunnel_engine.sessions.values()
    )
    
    max_threat = max(
        (s.threat_level for s in tunnel_engine.sessions.values()),
        default=ThreatLevel.NONE
    )
    
    # Add backpressure stats
    backpressure_stats = {
        "active_connections": len(active_tunnels),
        "total_queued_messages": sum(c.queue.qsize() for c in active_tunnels.values()),
        "total_dropped_messages": sum(c.messages_dropped for c in active_tunnels.values()),
        "unhealthy_connections": sum(1 for c in active_tunnels.values() if not c.is_healthy),
        "connection_limit": MAX_TOTAL_CONNECTIONS,
        "queue_limit": MAX_QUEUE_SIZE
    }
    
    security_report = tunnel_engine.get_security_report()
    security_report["backpressure"] = backpressure_stats
    
    return TunnelStatsResponse(
        active_sessions=len(tunnel_engine.sessions),
        total_bytes_transferred=total_bytes,
        threat_level=max_threat.name,
        security_report=security_report
    )


@router.post("/stealth/mode")
async def set_stealth_mode(mode: str):
    """Set stealth obfuscation mode"""
    try:
        stealth_mode = StealthMode[mode.upper()]
        stealth_layer.set_mode(stealth_mode)
        return {"status": "ok", "mode": stealth_mode.name}
    except KeyError:
        raise HTTPException(status_code=400, detail=f"Invalid mode: {mode}")


@router.get("/stealth/stats")
async def get_stealth_stats():
    """Get stealth layer statistics"""
    return stealth_layer.get_stats()


@router.delete("/session/{session_id}")
async def close_tunnel_session(session_id: str):
    """Force close a tunnel session"""
    if session_id in tunnel_engine.sessions:
        tunnel_engine.close_session(session_id)
        
        if session_id in active_tunnels:
            conn = active_tunnels[session_id]
            conn.is_healthy = False
            try:
                await conn.websocket.close()
            except Exception:
                pass
            unregister_connection(session_id)
        
        return {"status": "closed", "session_id": session_id[:8]}
    else:
        raise HTTPException(status_code=404, detail="Session not found")


async def send_to_tunnel(session_id: str, data: Dict) -> bool:
    """Send data through encrypted tunnel to client with backpressure."""
    if session_id not in active_tunnels:
        return False
    
    conn = active_tunnels[session_id]
    if not conn.is_healthy:
        return False
    
    try:
        plaintext = json.dumps(data).encode()
        envelope = tunnel_engine.encrypt_message(session_id, plaintext)
        if envelope:
            return await enqueue_message(conn, envelope)
    except Exception as e:
        logger.error(f"Send to tunnel error: {e}")

    return False


async def broadcast_to_tunnels(data: Dict, exclude: Optional[str] = None):
    """Broadcast data to all active tunnels with backpressure."""
    tasks = []
    for session_id in list(active_tunnels.keys()):
        if session_id == exclude:
            continue
        tasks.append(send_to_tunnel(session_id, data))
    
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


@router.get("/connections/stats")
async def get_connection_stats():
    """Get detailed connection statistics for monitoring."""
    connections = []
    for session_id, conn in active_tunnels.items():
        connections.append({
            "session_id": session_id[:8] + "...",
            "connected_at": conn.connected_at,
            "uptime_seconds": int(time.time() - conn.connected_at),
            "queue_size": conn.queue.qsize(),
            "messages_sent": conn.messages_sent,
            "messages_dropped": conn.messages_dropped,
            "bytes_sent": conn.bytes_sent,
            "is_healthy": conn.is_healthy,
            "last_heartbeat_ago": int(time.time() - conn.last_heartbeat)
        })
    
    return {
        "total_connections": len(active_tunnels),
        "total_users": len(user_connections),
        "connections": connections,
        "limits": {
            "max_queue_size": MAX_QUEUE_SIZE,
            "max_per_user": MAX_CONNECTIONS_PER_USER,
            "max_total": MAX_TOTAL_CONNECTIONS,
            "heartbeat_timeout": HEARTBEAT_TIMEOUT
        }
    }
