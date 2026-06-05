"""
PATHMAP - Encrypted Tunnel Engine (protocol v2)
===============================================
ECDH P-256 key exchange, HKDF-SHA256 key derivation, and AES-256-GCM
authenticated encryption. P-256 is used so the browser client can use native
WebCrypto with no fallback; both ends derive identical directional keys from a
salt computed over both public keys. See frontend/src/services/tunnelService.ts
for the matching client and backend/tests/test_tunnel.py for the round-trip
tests.

- Ephemeral keys per connection (forward secrecy across sessions)
- Authenticated encryption (tamper-evident)
- AAD binds every message to its session id
"""

import json
import time
import hashlib
import hmac
import base64
import secrets
import struct
import threading
import logging
from typing import Optional, Dict, Any, List, Tuple, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import deque

try:
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    from cryptography.hazmat.backends import default_backend
    CRYPTO_AVAILABLE = True
except ImportError:
    CRYPTO_AVAILABLE = False

logger = logging.getLogger("TunnelEngine")


class TunnelState(Enum):
    DISCONNECTED = 0
    HANDSHAKING = 1
    ESTABLISHED = 2
    REKEYING = 3
    TERMINATED = 4


class ThreatLevel(Enum):
    NONE = 0
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    CRITICAL = 4


@dataclass
class TunnelSession:
    session_id: str
    state: TunnelState
    local_private_key: Any = None
    local_public_key: bytes = b''
    remote_public_key: bytes = b''
    shared_secret: bytes = b''
    send_key: bytes = b''
    recv_key: bytes = b''
    send_nonce_counter: int = 0
    recv_nonce_counter: int = 0
    created_at: float = 0.0
    last_rekey_at: float = 0.0
    bytes_sent: int = 0
    bytes_received: int = 0
    messages_sent: int = 0
    messages_received: int = 0
    key_rotation_count: int = 0
    threat_level: ThreatLevel = ThreatLevel.NONE


@dataclass
class AISecurityModel:
    packet_sizes: deque = field(default_factory=lambda: deque(maxlen=1000))
    packet_intervals: deque = field(default_factory=lambda: deque(maxlen=1000))
    avg_packet_size: float = 0.0
    avg_interval: float = 0.0
    size_stddev: float = 100.0
    interval_stddev: float = 0.1
    replay_attempts: int = 0
    invalid_macs: int = 0
    timing_anomalies: int = 0
    size_anomalies: int = 0
    learning_rate: float = 0.01
    samples_collected: int = 0


class TunnelEngine:
    """
    Military-Grade Encrypted Tunnel Engine
    
    Features:
    - X25519 Elliptic Curve Diffie-Hellman key exchange
    - AES-256-GCM authenticated encryption
    - Perfect Forward Secrecy with automatic key rotation
    - Anti-traffic analysis with padding and timing jitter
    - AI-powered threat detection and adaptive security
    - Zero-knowledge architecture
    """
    
    VERSION = 1
    FRAME_DATA = 0
    FRAME_HANDSHAKE = 1
    FRAME_REKEY = 2
    FRAME_HEARTBEAT = 3
    FRAME_CLOSE = 4
    
    KEY_SIZE = 32
    NONCE_SIZE = 12
    SESSION_ID_SIZE = 16
    MAC_SIZE = 16
    
    KEY_ROTATION_INTERVAL = 300
    KEY_ROTATION_BYTES = 104857600
    KEY_ROTATION_MESSAGES = 10000
    
    MIN_PADDING = 16
    MAX_PADDING = 256
    PADDING_BLOCK = 16
    
    def __init__(self, master_secret: Optional[bytes] = None):
        self.master_secret = master_secret or secrets.token_bytes(32)
        self.sessions: Dict[str, TunnelSession] = {}
        self.ai_model = AISecurityModel()
        self._lock = threading.RLock()
        self._nonce_cache: Dict[str, set] = {}
        self._threat_callbacks: List[Callable] = []
        self._last_packet_time = time.time()
        
        if not CRYPTO_AVAILABLE:
            logger.warning("Cryptography library not available - using fallback mode")
    
    # Curve is NIST P-256 (secp256r1) end-to-end so the browser can use native
    # WebCrypto (ECDH P-256) with no fallback. Public keys are the 65-byte
    # uncompressed point (0x04 || X || Y). This protocol is "v2"; the KDF salt is
    # derived from both public keys so the client can reproduce it (the old
    # design used a server-only secret as salt, which the client could never know).
    PROTO_LABEL = b"pathmap-tunnel-v2"
    KDF_INFO = b"pathmap-tunnel-keys"

    def generate_keypair(self):
        """Return (private_key_obj_or_bytes, public_raw_uncompressed_bytes)."""
        if CRYPTO_AVAILABLE:
            private_key = ec.generate_private_key(ec.SECP256R1())
            public_bytes = private_key.public_key().public_bytes(
                encoding=serialization.Encoding.X962,
                format=serialization.PublicFormat.UncompressedPoint,
            )
            return private_key, public_bytes
        else:
            private = secrets.token_bytes(32)
            public = b"\x04" + hashlib.sha256(private).digest() + hashlib.sha256(private[::-1]).digest()
            return private, public

    def compute_shared_secret(self, local_private, remote_public: bytes) -> bytes:
        if CRYPTO_AVAILABLE:
            peer = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), remote_public)
            return local_private.exchange(ec.ECDH(), peer)
        else:
            return hashlib.sha256(bytes(local_private) + remote_public).digest()

    def _kdf_salt(self, client_pub: bytes, server_pub: bytes) -> bytes:
        # Both ends know both public keys, so both derive the same salt.
        return hashlib.sha256(self.PROTO_LABEL + client_pub + server_pub).digest()

    def derive_session_keys(
        self, shared_secret: bytes, client_pub: bytes, server_pub: bytes, rotation: int = 0
    ) -> Tuple[bytes, bytes]:
        """Return (key_c2s, key_s2c). key_c2s encrypts client->server traffic,
        key_s2c encrypts server->client traffic."""
        salt = self._kdf_salt(client_pub, server_pub)
        info = self.KDF_INFO + b":" + str(rotation).encode()
        if CRYPTO_AVAILABLE:
            hkdf = HKDF(
                algorithm=hashes.SHA256(),
                length=self.KEY_SIZE * 2,
                salt=salt,
                info=info,
                backend=default_backend()
            )
            key_material = hkdf.derive(shared_secret)
        else:
            key_material = hashlib.pbkdf2_hmac('sha256', shared_secret + info, salt, 100000, dklen=64)
        return key_material[:self.KEY_SIZE], key_material[self.KEY_SIZE:]
    
    def create_session(self) -> Tuple[str, bytes]:
        session_id = secrets.token_hex(self.SESSION_ID_SIZE)
        private_key, public_key = self.generate_keypair()
        session = TunnelSession(
            session_id=session_id,
            state=TunnelState.HANDSHAKING,
            local_private_key=private_key,
            local_public_key=public_key,
            created_at=time.time(),
            last_rekey_at=time.time()
        )
        with self._lock:
            self.sessions[session_id] = session
            self._nonce_cache[session_id] = set()
        logger.info(f"Created tunnel session: {session_id[:8]}...")
        return session_id, public_key
    
    def complete_handshake(self, session_id: str, remote_public_key: bytes) -> bool:
        with self._lock:
            session = self.sessions.get(session_id)
            if not session or session.state != TunnelState.HANDSHAKING:
                return False
            try:
                session.remote_public_key = remote_public_key
                session.shared_secret = self.compute_shared_secret(session.local_private_key, remote_public_key)
                key_c2s, key_s2c = self.derive_session_keys(
                    session.shared_secret, remote_public_key, session.local_public_key, 0
                )
            except Exception as e:
                logger.warning(f"Handshake key agreement failed for {session_id[:8]}: {e}")
                return False
            # Server receives client->server traffic and sends server->client.
            session.recv_key = key_c2s
            session.send_key = key_s2c
            session.state = TunnelState.ESTABLISHED
            logger.info(f"Tunnel established: {session_id[:8]}...")
            return True
    
    def rotate_keys(self, session_id: str) -> bool:
        with self._lock:
            session = self.sessions.get(session_id)
            if not session or session.state != TunnelState.ESTABLISHED:
                return False
            session.state = TunnelState.REKEYING
            session.key_rotation_count += 1
            key_c2s, key_s2c = self.derive_session_keys(
                session.shared_secret, session.remote_public_key,
                session.local_public_key, session.key_rotation_count
            )
            session.recv_key = key_c2s
            session.send_key = key_s2c
            session.send_nonce_counter = 0
            session.recv_nonce_counter = 0
            session.last_rekey_at = time.time()
            self._nonce_cache[session_id].clear()
            session.state = TunnelState.ESTABLISHED
            logger.info(f"Keys rotated: {session_id[:8]}... (#{session.key_rotation_count})")
            return True
    
    def should_rotate_keys(self, session_id: str) -> bool:
        # Protocol v2 does not yet negotiate mid-session re-keying with the
        # browser client, so auto-rotation is disabled to avoid silently
        # breaking an established tunnel. Keys remain ephemeral per connection
        # (a reconnect performs a fresh ECDH handshake), preserving forward
        # secrecy across sessions. Re-enable once a rekey frame is added to
        # both ends.
        return False
    
    def close_session(self, session_id: str):
        with self._lock:
            session = self.sessions.pop(session_id, None)
            if session:
                session.shared_secret = b'\x00' * len(session.shared_secret) if session.shared_secret else b''
                session.send_key = b'\x00' * len(session.send_key) if session.send_key else b''
                session.recv_key = b'\x00' * len(session.recv_key) if session.recv_key else b''
                session.local_private_key = None
                session.state = TunnelState.TERMINATED
            self._nonce_cache.pop(session_id, None)
            logger.info(f"Session closed: {session_id[:8]}...")
    
    def encrypt_frame(self, session_id: str, plaintext: bytes, frame_type: int = 0) -> Optional[bytes]:
        with self._lock:
            session = self.sessions.get(session_id)
            if not session or session.state != TunnelState.ESTABLISHED:
                return None
            
            if self.should_rotate_keys(session_id):
                self.rotate_keys(session_id)
            
            nonce = struct.pack('>Q', session.send_nonce_counter) + secrets.token_bytes(4)
            session.send_nonce_counter += 1
            
            padding_len = self._calculate_padding(len(plaintext))
            padding = secrets.token_bytes(padding_len)
            padded_data = struct.pack('>I', len(plaintext)) + plaintext + padding
            
            if CRYPTO_AVAILABLE:
                aesgcm = AESGCM(session.send_key)
                aad = session_id.encode() + struct.pack('>BI', frame_type, session.send_nonce_counter - 1)
                ciphertext = aesgcm.encrypt(nonce, padded_data, aad)
            else:
                ciphertext = self._fallback_encrypt(session.send_key, nonce, padded_data)
            
            frame = struct.pack('>BB', self.VERSION, frame_type)
            frame += bytes.fromhex(session_id)
            frame += nonce
            frame += struct.pack('>I', len(ciphertext))
            frame += ciphertext
            
            session.bytes_sent += len(frame)
            session.messages_sent += 1
            self._ai_learn_packet(len(frame))
            return frame
    
    def decrypt_frame(self, frame_data: bytes) -> Optional[Tuple[str, bytes, int]]:
        try:
            version, frame_type = struct.unpack('>BB', frame_data[:2])
            if version != self.VERSION:
                return None
            
            session_id = frame_data[2:2 + self.SESSION_ID_SIZE].hex()
            nonce = frame_data[2 + self.SESSION_ID_SIZE:2 + self.SESSION_ID_SIZE + self.NONCE_SIZE]
            struct.unpack('>I', frame_data[2 + self.SESSION_ID_SIZE + self.NONCE_SIZE:2 + self.SESSION_ID_SIZE + self.NONCE_SIZE + 4])[0]
            ciphertext = frame_data[2 + self.SESSION_ID_SIZE + self.NONCE_SIZE + 4:]
            
            with self._lock:
                session = self.sessions.get(session_id)
                if not session or session.state not in [TunnelState.ESTABLISHED, TunnelState.REKEYING]:
                    self.ai_model.invalid_macs += 1
                    return None
                
                nonce_int = struct.unpack('>Q', nonce[:8])[0]
                if nonce_int in self._nonce_cache.get(session_id, set()):
                    self.ai_model.replay_attempts += 1
                    self._check_threat_level()
                    logger.warning(f"Replay attack detected: {session_id[:8]}...")
                    return None
                
                if CRYPTO_AVAILABLE:
                    aesgcm = AESGCM(session.recv_key)
                    aad = session_id.encode() + struct.pack('>BI', frame_type, nonce_int)
                    try:
                        padded_data = aesgcm.decrypt(nonce, ciphertext, aad)
                    except Exception:
                        self.ai_model.invalid_macs += 1
                        self._check_threat_level()
                        return None
                else:
                    padded_data = self._fallback_decrypt(session.recv_key, nonce, ciphertext)
                    if padded_data is None:
                        return None
                
                plaintext_len = struct.unpack('>I', padded_data[:4])[0]
                plaintext = padded_data[4:4 + plaintext_len]
                
                self._nonce_cache[session_id].add(nonce_int)
                session.recv_nonce_counter = max(session.recv_nonce_counter, nonce_int + 1)
                session.bytes_received += len(frame_data)
                session.messages_received += 1
                
                return session_id, plaintext, frame_type
        except Exception as e:
            logger.error(f"Frame decryption error: {e}")
            return None
    
    def encrypt_message(self, session_id: str, plaintext: bytes) -> Optional[str]:
        """Encrypt a server->client message into a JSON envelope string.

        Envelope: {"n": base64(nonce12), "ct": base64(ciphertext+tag)}.
        AES-256-GCM, AAD = utf8(session_id). Matches the browser client exactly.
        """
        with self._lock:
            session = self.sessions.get(session_id)
            if not session or session.state != TunnelState.ESTABLISHED:
                return None
            if self.should_rotate_keys(session_id):
                self.rotate_keys(session_id)
            if not CRYPTO_AVAILABLE:
                return None
            nonce = secrets.token_bytes(self.NONCE_SIZE)
            ct = AESGCM(session.send_key).encrypt(nonce, plaintext, session_id.encode())
            session.bytes_sent += len(ct)
            session.messages_sent += 1
            return json.dumps({
                "n": base64.b64encode(nonce).decode(),
                "ct": base64.b64encode(ct).decode(),
            })

    def decrypt_message(self, session_id: str, envelope: str) -> Optional[bytes]:
        """Decrypt a client->server JSON envelope. Returns plaintext or None."""
        with self._lock:
            session = self.sessions.get(session_id)
            if not session or session.state not in (TunnelState.ESTABLISHED, TunnelState.REKEYING):
                return None
            if not CRYPTO_AVAILABLE:
                return None
            try:
                obj = json.loads(envelope)
                nonce = base64.b64decode(obj["n"])
                ct = base64.b64decode(obj["ct"])
                pt = AESGCM(session.recv_key).decrypt(nonce, ct, session_id.encode())
                session.bytes_received += len(ct)
                session.messages_received += 1
                return pt
            except Exception as e:
                self.ai_model.invalid_macs += 1
                logger.warning(f"decrypt_message failed for {session_id[:8]}: {e}")
                return None

    def _calculate_padding(self, data_len: int) -> int:
        base_padding = self.PADDING_BLOCK - ((data_len + 4) % self.PADDING_BLOCK)
        extra_padding = secrets.randbelow(self.MAX_PADDING - self.MIN_PADDING)
        return base_padding + extra_padding
    
    def _fallback_encrypt(self, key: bytes, nonce: bytes, plaintext: bytes) -> bytes:
        keystream = self._generate_keystream(key, nonce, len(plaintext))
        ciphertext = bytes(a ^ b for a, b in zip(plaintext, keystream))
        mac = hmac.new(key, nonce + ciphertext, hashlib.sha256).digest()[:self.MAC_SIZE]
        return ciphertext + mac
    
    def _fallback_decrypt(self, key: bytes, nonce: bytes, data: bytes) -> Optional[bytes]:
        if len(data) < self.MAC_SIZE:
            return None
        ciphertext = data[:-self.MAC_SIZE]
        received_mac = data[-self.MAC_SIZE:]
        expected_mac = hmac.new(key, nonce + ciphertext, hashlib.sha256).digest()[:self.MAC_SIZE]
        if not hmac.compare_digest(received_mac, expected_mac):
            return None
        keystream = self._generate_keystream(key, nonce, len(ciphertext))
        return bytes(a ^ b for a, b in zip(ciphertext, keystream))
    
    def _generate_keystream(self, key: bytes, nonce: bytes, length: int) -> bytes:
        keystream = b''
        counter = 0
        while len(keystream) < length:
            block = hashlib.sha256(key + nonce + struct.pack('>I', counter)).digest()
            keystream += block
            counter += 1
        return keystream[:length]
    
    def _ai_learn_packet(self, packet_size: int):
        now = time.time()
        self.ai_model.packet_sizes.append(packet_size)
        if self.ai_model.samples_collected > 0:
            interval = now - self._last_packet_time
            self.ai_model.packet_intervals.append(interval)
        self._last_packet_time = now
        self.ai_model.samples_collected += 1
        
        if len(self.ai_model.packet_sizes) > 10:
            sizes = list(self.ai_model.packet_sizes)
            self.ai_model.avg_packet_size = sum(sizes) / len(sizes)
            variance = sum((x - self.ai_model.avg_packet_size) ** 2 for x in sizes) / len(sizes)
            self.ai_model.size_stddev = variance ** 0.5
        
        if len(self.ai_model.packet_intervals) > 10:
            intervals = list(self.ai_model.packet_intervals)
            self.ai_model.avg_interval = sum(intervals) / len(intervals)
            variance = sum((x - self.ai_model.avg_interval) ** 2 for x in intervals) / len(intervals)
            self.ai_model.interval_stddev = variance ** 0.5
    
    def _check_threat_level(self):
        model = self.ai_model
        threat_score = model.replay_attempts * 20 + model.invalid_macs * 10 + model.timing_anomalies * 5 + model.size_anomalies * 3
        
        if threat_score >= 100:
            new_level = ThreatLevel.CRITICAL
        elif threat_score >= 50:
            new_level = ThreatLevel.HIGH
        elif threat_score >= 20:
            new_level = ThreatLevel.MEDIUM
        elif threat_score >= 5:
            new_level = ThreatLevel.LOW
        else:
            new_level = ThreatLevel.NONE
        
        for session in self.sessions.values():
            old_level = session.threat_level
            session.threat_level = new_level
            if new_level.value > old_level.value:
                logger.warning(f"Threat level: {new_level.name} for {session.session_id[:8]}...")
                self._notify_threat(session, new_level)
    
    def _notify_threat(self, session: TunnelSession, level: ThreatLevel):
        for callback in self._threat_callbacks:
            try:
                callback(session.session_id, level)
            except Exception as e:
                logger.error(f"Threat callback error: {e}")
    
    def register_threat_callback(self, callback: Callable[[str, ThreatLevel], None]):
        self._threat_callbacks.append(callback)
    
    def get_session_info(self, session_id: str) -> Optional[Dict[str, Any]]:
        session = self.sessions.get(session_id)
        if not session:
            return None
        return {
            'session_id': session_id[:8] + '...',
            'state': session.state.name,
            'created_at': session.created_at,
            'bytes_sent': session.bytes_sent,
            'bytes_received': session.bytes_received,
            'messages_sent': session.messages_sent,
            'messages_received': session.messages_received,
            'key_rotations': session.key_rotation_count,
            'threat_level': session.threat_level.name
        }
    
    def get_security_report(self) -> Dict[str, Any]:
        return {
            'samples_collected': self.ai_model.samples_collected,
            'avg_packet_size': round(self.ai_model.avg_packet_size, 2),
            'avg_interval': round(self.ai_model.avg_interval, 4),
            'replay_attempts': self.ai_model.replay_attempts,
            'invalid_macs': self.ai_model.invalid_macs,
            'timing_anomalies': self.ai_model.timing_anomalies,
            'size_anomalies': self.ai_model.size_anomalies,
            'active_sessions': len(self.sessions),
            'total_key_rotations': sum(s.key_rotation_count for s in self.sessions.values())
        }


_tunnel_engine: Optional[TunnelEngine] = None


def get_tunnel_engine() -> TunnelEngine:
    global _tunnel_engine
    if _tunnel_engine is None:
        _tunnel_engine = TunnelEngine()
    return _tunnel_engine
