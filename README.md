# PathMap

Real-time location tracking infrastructure with end-to-end encryption.

## Problem Statement

Organizations tracking mobile assets—field teams, delivery fleets, family members—face a structural tradeoff: commercial tracking services sacrifice privacy for convenience, while self-hosted solutions sacrifice usability for control.

PathMap targets technical teams who need both. It provides real-time location coordination with end-to-end encryption, ensuring location data remains inaccessible to the server operator. The threat model assumes a compromised server or malicious administrator—location payloads are encrypted client-to-client.

**Primary persona:** Operations lead managing 10-50 mobile workers who cannot trust third-party infrastructure with location data due to regulatory, competitive, or safety constraints.

---

## Security Model

### Threat Model

PathMap protects against:
- **Passive server compromise** — Encrypted payloads are opaque to the backend
- **Network eavesdropping** — TLS + application-layer encryption
- **Credential theft** — Short-lived tokens, refresh rotation

PathMap does NOT protect against:
- **Compromised client devices** — If the endpoint is owned, location is exposed
- **Traffic analysis** — Timing and packet sizes leak metadata (partial mitigation via obfuscation)
- **Targeted key extraction** — No HSM integration; keys reside in process memory

### Cryptographic Implementation

| Layer | Algorithm | Implementation |
|-------|-----------|----------------|
| Key exchange | X25519 ECDH | `cryptography` library |
| Payload encryption | AES-256-GCM | 96-bit nonces, counter-tracked |
| Key derivation | HKDF-SHA256 | Per-session keys |
| Authentication | HMAC-SHA256 | Custom JWT implementation |
| Password storage | bcrypt | Cost factor 12 |

**Key rotation policy:**
- Time-based: 300 seconds
- Volume-based: 100MB or 10,000 messages
- Automatic renegotiation on threshold

### Trust Boundaries

```
[Client Device] ──TLS──► [PathMap Server] ──TLS──► [Client Device]
       │                        │                        │
       └────────── E2E encrypted payload ────────────────┘
                      (server cannot decrypt)
```

The server routes encrypted blobs. It knows WHO communicates and WHEN, but not WHERE.

### Dependency Requirements

The `cryptography` library is required for security guarantees. Without it, the system falls back to XOR-based obfuscation—this provides **no security against motivated attackers** and logs a warning on startup.

---

## Core Capabilities

### 1. Encrypted Location Relay

WebSocket tunnel with X25519 key exchange. Location updates are encrypted before leaving the client and decrypted only by authorized recipients.

**Why it matters:** Removes the server operator from the trust model.  
**What breaks without it:** The entire privacy premise.

### 2. Multi-Sensor Position Estimation

Extended Kalman filter fusing GPS, accelerometer, gyroscope, and compass. Produces smoothed positions with confidence intervals.

**Why it matters:** Raw GPS jumps ±10m in urban environments. Sensor fusion provides stable tracks.  
**What breaks without it:** Geofence false-triggers, unnecessary reroutes.

### 3. Offline-Capable Routing

A*, Dijkstra, and greedy pathfinding over OpenStreetMap graphs. No external API dependency.

**Why it matters:** Field teams operate with intermittent connectivity.  
**What breaks without it:** Navigation fails offline; external API costs scale with usage.

---

## Power Features

| Feature | Purpose | Limitation |
|---------|---------|------------|
| **Geofencing** | Entry/exit alerts for defined zones | Circular zones only (no polygons) |
| **Location Sharing** | Time-limited sharing with precision control | Requires both parties online |
| **Traffic Obfuscation** | Packet padding, timing jitter, decoys | 10-30% bandwidth overhead |
| **Ghost Mode** | Stop broadcasting while appearing online | Social engineering risk |
| **Rate Limiting** | Token bucket per-endpoint | No distributed limiting |

---

## Architecture

### Technology Choices

**FastAPI** over Django/Flask:
- Native async for WebSocket scaling
- Pydantic validation reduces input bugs
- Sufficient for 10K concurrent connections

**WebSockets** over gRPC/polling:
- 50x reduction in connection overhead for 2-second updates
- Browser support without proxy
- Tradeoff: manual backpressure handling required

### Data Flow

```
┌─────────────┐     HTTPS/WSS      ┌─────────────┐      WSS/E2E      ┌─────────────┐
│   Device    │ ─────────────────► │   Server    │ ─────────────────►│  Recipient  │
│  (mobile)   │  encrypted payload │  (FastAPI)  │  routes opaque    │  (web/app)  │
└─────────────┘                    └─────────────┘  blob              └─────────────┘
      │                                   │
      │ GPS/sensors @ 2s                  │ Stores: accounts, geofences, sessions
      ▼                                   │ Does NOT store: location data
┌─────────────┐                           ▼
│   Kalman    │                    ┌─────────────┐
│   Filter    │                    │  PostgreSQL │
└─────────────┘                    └─────────────┘
```

### Failure Modes

| Failure | Behavior | Recovery |
|---------|----------|----------|
| Database unavailable | Auth fails; existing sessions continue | Exponential backoff reconnect |
| WebSocket disconnect | Client queues updates locally | Auto-reconnect with replay |
| Crypto library missing | Weak obfuscation + warning log | Install `cryptography` |
| OSM graph load failure | Routing unavailable; tracking continues | Restart with valid graph |

---

## Quick Start

### 1. Start Server

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 2. Register User

```bash
curl -X POST http://localhost:8000/api/v1/social/register \
  -H "Content-Type: application/json" \
  -d '{"username": "worker1", "password": "secure123", "email": "worker@example.com"}'
```

Response:
```json
{"user_id": "uuid-here", "access_token": "eyJ..."}
```

### 3. Open Encrypted Tunnel

```javascript
const ws = new WebSocket('ws://localhost:8000/api/v1/tunnel/connect');
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'handshake',
    token: 'eyJ...',
    public_key: clientX25519PublicKey
  }));
};
```

### 4. Send Location

```javascript
const encrypted = aesGcmEncrypt(sharedSecret, JSON.stringify({
  lat: 40.7128, lon: -74.0060, accuracy: 10, timestamp: Date.now()
}));
ws.send(JSON.stringify({ type: 'location', payload: encrypted }));
```

**Expected errors:**
- `401` — Token expired; refresh and retry
- `429` — Rate limited; backoff 60 seconds
- `handshake_failed` — Regenerate keypair

---

## Deployment

### Environment Variables

```env
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/pathmap
JWT_SECRET_KEY=<openssl rand -hex 32>
CORS_ORIGINS=https://your-domain.com
```

### Docker

```bash
docker-compose up -d
```

Note: Add PostgreSQL service to `docker-compose.yml` for production.

### Kubernetes

```bash
kubectl apply -f k8s/
```

Manifests deploy: Backend (3 replicas), PostgreSQL StatefulSet.  
**Not included:** Ingress, TLS termination, secrets management.

---

## Known Limitations

- **No offline map tiles** — Requires network for tile fetching
- **Single-region deployment** — No geo-replication
- **No HSM support** — Keys in process memory

---

## Version History

| Version | Changes |
|---------|---------|
| 96 | X25519 tunnel encryption, traffic obfuscation |
| 95 | Device tracking API, JWT authentication |
| 94 | Kalman filter sensor fusion |
| 93 | Friends, location sharing, ghost mode |

---

## What PathMap Does Not Solve

- **Consumer app distribution** — No iOS/Android apps provided
- **Compliance certification** — Not HIPAA, SOC2, or GDPR audited
- **Sub-meter accuracy** — Consumer GPS limits apply
- **Indoor positioning** — No WiFi/BLE beacon support
- **Historical analytics** — No location warehousing or heatmaps

PathMap is infrastructure for teams building location-aware systems who need encryption guarantees. It is not a turnkey consumer product.

---

## License

Proprietary. All rights reserved.
