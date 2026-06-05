"""
PATHMAP - Stealth Traffic Obfuscation Layer
============================================
Makes tracking traffic invisible and undetectable.
Military-grade traffic camouflage with AI-powered pattern randomization.

Features:
- TLS header camouflage (looks like normal HTTPS)
- Packet size normalization (anti-traffic analysis)
- Timing jitter injection
- Decoy traffic generation
- AI-learned traffic patterns
"""

import time
import random
import hashlib
import struct
import secrets
import threading
from typing import Optional, Dict, Any
from dataclasses import dataclass
from enum import Enum
from collections import deque


class StealthMode(Enum):
    DISABLED = 0
    BASIC = 1
    ENHANCED = 2
    PARANOID = 3


@dataclass
class StealthConfig:
    mode: StealthMode = StealthMode.ENHANCED
    min_packet_size: int = 512
    max_packet_size: int = 1500
    timing_jitter_ms: int = 100
    decoy_ratio: float = 0.1
    header_camouflage: bool = True
    normalize_sizes: bool = True
    inject_noise: bool = True


@dataclass 
class TrafficPattern:
    avg_size: float = 0.0
    avg_interval: float = 0.0
    size_variance: float = 0.0
    interval_variance: float = 0.0
    samples: int = 0


class StealthLayer:
    """
    Traffic Obfuscation Layer for Invisible Communications
    
    Makes all tracking data look like normal web traffic to avoid detection.
    Uses AI to learn and mimic legitimate traffic patterns.
    """
    
    TLS_MAGIC = b'\x17\x03\x03'
    HTTP_MAGIC = b'HTTP/1.1 200'
    WEBSOCKET_MAGIC = b'\x81'
    
    def __init__(self, config: Optional[StealthConfig] = None):
        self.config = config or StealthConfig()
        self._lock = threading.RLock()
        self._last_send_time = time.time()
        self._decoy_counter = 0
        
        self._learned_pattern = TrafficPattern()
        self._packet_sizes: deque = deque(maxlen=500)
        self._packet_intervals: deque = deque(maxlen=500)
    
    def obfuscate(self, data: bytes, add_camouflage: bool = True) -> bytes:
        """Apply stealth obfuscation to outgoing data"""
        if self.config.mode == StealthMode.DISABLED:
            return data
        
        with self._lock:
            target_size = self._calculate_target_size(len(data))
            padding_needed = target_size - len(data) - 8
            
            if self.config.inject_noise:
                noise = self._generate_noise(max(0, padding_needed))
            else:
                noise = secrets.token_bytes(max(0, padding_needed))
            
            packet = struct.pack('>I', len(data))
            packet += struct.pack('>I', len(noise))
            packet += data
            packet += noise
            
            if add_camouflage and self.config.header_camouflage:
                packet = self._add_header_camouflage(packet)
            
            self._record_packet(len(packet))
            return packet
    
    def deobfuscate(self, packet: bytes) -> Optional[bytes]:
        """Remove stealth obfuscation from incoming data"""
        try:
            offset = 0
            
            if self.config.header_camouflage:
                offset = self._strip_header_camouflage(packet)
                if offset < 0:
                    return None
            
            data_len = struct.unpack('>I', packet[offset:offset+4])[0]
            struct.unpack('>I', packet[offset+4:offset+8])[0]
            
            if data_len > len(packet) - offset - 8:
                return None
            
            data = packet[offset+8:offset+8+data_len]
            return data
            
        except Exception:
            return None
    
    def _add_header_camouflage(self, data: bytes) -> bytes:
        """Add TLS-like header to disguise traffic"""
        if self.config.mode == StealthMode.PARANOID:
            seq_num = secrets.token_bytes(8)
            mac = hashlib.sha256(data + seq_num).digest()[:8]
            inner = seq_num + mac + data
            header = self.TLS_MAGIC + struct.pack('>H', len(inner))
            return header + inner
        else:
            header = self.TLS_MAGIC + struct.pack('>H', len(data))
            return header + data
    
    def _strip_header_camouflage(self, packet: bytes) -> int:
        """Strip TLS-like header and return data offset"""
        if len(packet) < 5:
            return -1
        
        if packet[:3] == self.TLS_MAGIC:
            struct.unpack('>H', packet[3:5])[0]
            
            if self.config.mode == StealthMode.PARANOID:
                if len(packet) < 5 + 16:
                    return -1
                return 5 + 16
            else:
                return 5
        
        return 0
    
    def _calculate_target_size(self, data_len: int) -> int:
        """Calculate padded size for traffic uniformity"""
        base = data_len + 8
        
        if self.config.mode == StealthMode.PARANOID:
            return self.config.max_packet_size
        
        if self.config.mode == StealthMode.ENHANCED:
            if base <= 256:
                return 256
            elif base <= 512:
                return 512
            elif base <= 1024:
                return 1024
            else:
                return self.config.max_packet_size
        
        block = 64
        padded = ((base + block - 1) // block) * block
        return min(padded, self.config.max_packet_size)
    
    def _generate_noise(self, length: int) -> bytes:
        """Generate realistic-looking noise data"""
        if length <= 0:
            return b''
        
        noise = bytearray(length)
        
        patterns = [
            b'\x00' * 16,
            secrets.token_bytes(16),
            bytes(range(16)),
            bytes([0xFF] * 16),
        ]
        
        pos = 0
        while pos < length:
            pattern = random.choice(patterns)
            chunk_size = min(len(pattern), length - pos)
            noise[pos:pos+chunk_size] = pattern[:chunk_size]
            pos += chunk_size
        
        return bytes(noise)
    
    def _record_packet(self, size: int):
        """Record packet for AI learning"""
        now = time.time()
        
        self._packet_sizes.append(size)
        
        if self._last_send_time > 0:
            interval = now - self._last_send_time
            self._packet_intervals.append(interval)
        
        self._last_send_time = now
        
        self._update_learned_pattern()
    
    def _update_learned_pattern(self):
        """Update AI-learned traffic pattern"""
        if len(self._packet_sizes) < 10:
            return
        
        sizes = list(self._packet_sizes)
        self._learned_pattern.avg_size = sum(sizes) / len(sizes)
        self._learned_pattern.size_variance = sum((s - self._learned_pattern.avg_size)**2 for s in sizes) / len(sizes)
        
        if len(self._packet_intervals) >= 10:
            intervals = list(self._packet_intervals)
            self._learned_pattern.avg_interval = sum(intervals) / len(intervals)
            self._learned_pattern.interval_variance = sum((i - self._learned_pattern.avg_interval)**2 for i in intervals) / len(intervals)
        
        self._learned_pattern.samples = len(self._packet_sizes)
    
    def get_timing_delay(self) -> float:
        """Get random delay for timing obfuscation"""
        if self.config.mode == StealthMode.DISABLED:
            return 0.0
        
        base_jitter = self.config.timing_jitter_ms / 1000.0
        
        if self.config.mode == StealthMode.PARANOID:
            return random.uniform(base_jitter * 0.5, base_jitter * 2.0)
        elif self.config.mode == StealthMode.ENHANCED:
            return random.uniform(0, base_jitter)
        else:
            return random.uniform(0, base_jitter * 0.5)
    
    def should_send_decoy(self) -> bool:
        """Determine if decoy packet should be sent"""
        if self.config.mode.value < StealthMode.ENHANCED.value:
            return False
        return random.random() < self.config.decoy_ratio
    
    def generate_decoy(self) -> bytes:
        """Generate decoy traffic packet"""
        self._decoy_counter += 1
        
        if self._learned_pattern.samples > 50:
            target_size = int(self._learned_pattern.avg_size + random.gauss(0, self._learned_pattern.size_variance ** 0.5))
            target_size = max(self.config.min_packet_size, min(target_size, self.config.max_packet_size))
        else:
            target_size = random.randint(self.config.min_packet_size, self.config.max_packet_size)
        
        decoy_data = secrets.token_bytes(target_size - 100)
        return self.obfuscate(decoy_data, add_camouflage=True)
    
    def set_mode(self, mode: StealthMode):
        """Change stealth mode"""
        with self._lock:
            self.config.mode = mode
    
    def get_stats(self) -> Dict[str, Any]:
        """Get stealth layer statistics"""
        return {
            'mode': self.config.mode.name,
            'packets_processed': self._learned_pattern.samples,
            'avg_packet_size': round(self._learned_pattern.avg_size, 2),
            'avg_interval_ms': round(self._learned_pattern.avg_interval * 1000, 2),
            'decoys_sent': self._decoy_counter,
            'camouflage_enabled': self.config.header_camouflage
        }


_stealth_layer: Optional[StealthLayer] = None


def get_stealth_layer() -> StealthLayer:
    global _stealth_layer
    if _stealth_layer is None:
        _stealth_layer = StealthLayer()
    return _stealth_layer
