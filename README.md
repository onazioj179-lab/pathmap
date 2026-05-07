# PathMap

**Private, encrypted, real-time location tracking for teams that can't afford to trust anyone else's server.**

PathMap gives operations teams live location coordination with end-to-end encryption — meaning even the server operator cannot see where your people are. It is built for field teams, private deployments, and regulated environments where handing location data to a third-party cloud is not an option.

> PathMap is proprietary software by **onazi Treasure Oj**. Local evaluation is permitted. Production use, hosted access, resale, and commercial deployment require a paid license. See [Pricing](#commercial-license--pricing) and [LICENSE.md](LICENSE.md).

---

## Who This Is For

You are an operations lead managing 10–50 mobile workers. You need to know where they are in real time, but you cannot send that data through Google, Apple, or any commercial tracking cloud — whether for regulatory, competitive, or safety reasons.

You need tracking infrastructure you can run yourself, with a guarantee that the server sees only encrypted blobs it cannot read.

PathMap is that infrastructure.

---

## What PathMap Does

### Encrypted Location Relay

Every location update is encrypted on the device before it leaves. The server routes opaque encrypted blobs — it knows who is communicating and when, but never where they are. Only the intended recipient can decrypt the payload.

```
[Your Device] ──TLS──► [PathMap Server] ──TLS──► [Recipient Device]
      │                       │                         │
      └───────── End-to-end encrypted location ─────────┘
                    (server sees only ciphertext)
```

### Stable Position Tracking

Raw GPS moves ±10m even standing still. PathMap fuses GPS with accelerometer, gyroscope, and compass through an Extended Kalman filter, producing smooth, reliable position tracks. This prevents false geofence alerts and reduces unnecessary route corrections in urban environments.

### Offline-Ready Routing

Navigation runs entirely over OpenStreetMap data with no external API calls. Your team can route and navigate with intermittent or no connectivity. No per-request API costs, no third-party routing dependency.

---

## Security Design

PathMap is built to survive a compromised server.

**Protected against:**
- Server operator accessing location data — payloads are encrypted client-to-client
- Network interception — TLS in transit, AES-256-GCM at the application layer
- Token theft — short-lived JWTs with refresh rotation

**Not protected against:**
- Compromised end-user device — if the device is owned, location is exposed
- Traffic analysis — connection timing and packet sizes are observable (partially mitigated by traffic obfuscation)
- Key extraction — no HSM support; keys are held in process memory

**Cryptography stack:**

| Layer | Algorithm | Notes |
|---|---|---|
| Key exchange | X25519 ECDH | `cryptography` library required |
| Payload encryption | AES-256-GCM | 96-bit nonces, counter-tracked |
| Key derivation | HKDF-SHA256 | Per-session keys |
| Authentication | HMAC-SHA256 | Short-lived JWT tokens |
| Password hashing | bcrypt | Cost factor 12 |

Session keys rotate every 300 seconds or after 10,000 messages — whichever comes first. Renegotiation is automatic.

> **Dependency note:** The Python `cryptography` library is required for all security guarantees. Without it, the system falls back to weak XOR obfuscation and logs a prominent startup warning. Install it before any deployment handling real data.

---

## Features

| Feature | What it does | Known limit |
|---|---|---|
| **Encrypted tunnel** | X25519 + AES-256-GCM location relay | Server cannot decrypt |
| **Kalman filter positioning** | Sensor-fused smooth tracks | No indoor positioning |
| **Offline routing** | A*, Dijkstra, OSM-based navigation | Requires OSM graph on startup |
| **Geofencing** | Entry/exit alerts for defined zones | Circular zones only |
| **Time-limited location sharing** | Share position with precision control for a set window | Both parties must be online |
| **Ghost mode** | Stop broadcasting while appearing connected | Social engineering risk |
| **Traffic obfuscation** | Packet padding, timing jitter, decoys | 10–30% bandwidth overhead |
| **Rate limiting** | Token bucket per endpoint | No distributed rate limiting |

---

## Commercial License & Pricing

PathMap is proprietary software. This repository is public for evaluation and authorized development only — it does not grant any right to run it in production, resell it, host it as a service, or white-label it.

| Plan | Price | Best for | Includes |
|---|---|---|---|
| **Starter** | $19 / seat / month | Small teams running private encrypted tracking | Up to 5 devices, live encrypted map, route sharing, deployment support |
| **Pro** | $49 / seat / month | Field operations needing production-grade controls | Up to 25 devices, priority workflows, safety/routing/diagnostics, commercial production license |
| **Enterprise** | Custom — annual contract | Regulated teams, large-scale or private deployments | Device count by agreement, security review, dedicated deployment support |

To get a license or ask about Enterprise terms, contact **onazi Treasure Oj** directly.

Payment infrastructure is not bundled in this repository. Production operators connect their own billing and license enforcement before offering hosted access.

---

## Quick Start

### 1. Start the server

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 2. Register a user

```bash
curl -X POST http://localhost:8000/api/v1/social/register \
  -H "Content-Type: application/json" \
  -d '{"username": "worker1", "password": "secure123", "email": "worker@example.com"}'
```

```json
{ "user_id": "uuid-here", "access_token": "eyJ..." }
```

### 3. Open an encrypted tunnel

```javascript
const ws = new WebSocket("ws://localhost:8000/api/v1/tunnel/connect");
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: "handshake",
    token: "eyJ...",
    public_key: clientX25519PublicKey,
  }));
};
```

### 4. Send an encrypted location update

```javascript
const encrypted = aesGcmEncrypt(sharedSecret, JSON.stringify({
  lat: 40.7128,
  lon: -74.0060,
  accuracy: 10,
  timestamp: Date.now(),
}));
ws.send(JSON.stringify({ type: "location", payload: encrypted }));
```

**Common errors:**

| Code | Meaning | Fix |
|---|---|---|
| `401` | Token expired | Refresh token and retry |
| `429` | Rate limited | Wait 60 seconds |
| `handshake_failed` | Key exchange rejected | Regenerate keypair |

---

## Deployment

### Environment variables

```env
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/pathmap
JWT_SECRET_KEY=<openssl rand -hex 32>
CORS_ORIGINS=https://your-domain.com
```

### Docker

```bash
docker-compose up -d
```

Add a PostgreSQL service to `docker-compose.yml` before running in production.

### Kubernetes

```bash
kubectl apply -f k8s/
```

Deploys: backend (3 replicas) + PostgreSQL StatefulSet.
Not included: ingress, TLS termination, secrets management.

---

## How It Handles Failures

| Failure | What happens | How it recovers |
|---|---|---|
| Database down | Auth fails; active sessions continue | Exponential backoff reconnect |
| WebSocket drops | Client queues updates locally | Auto-reconnect with replay |
| `cryptography` missing | Falls back to weak obfuscation, logs warning | Install the library |
| OSM graph missing | Routing disabled; tracking continues | Restart with valid graph |

---

## What PathMap Does Not Do

- **No consumer mobile apps** — No iOS or Android app provided; web interface only
- **No compliance certification** — Not audited for HIPAA, SOC 2, or GDPR
- **No sub-meter accuracy** — Consumer GPS hardware limits apply
- **No indoor positioning** — No WiFi or BLE beacon support
- **No historical analytics** — No location storage, heatmaps, or replay
- **No geo-replication** — Single-region deployment only

PathMap is location infrastructure for teams building private tracking systems. It is not a turnkey consumer product.

---

## Architecture Notes

**Why FastAPI:** Native async support for WebSocket scale. Sufficient for 10,000 concurrent connections. Pydantic validation reduces malformed-input bugs.

**Why WebSockets over polling:** 50× lower connection overhead for 2-second update intervals. Native browser support without a proxy layer. Tradeoff: manual backpressure handling required.

**What the server stores:** Accounts, sessions, geofences.  
**What the server never stores:** Location data.

---

## Version History

| Version | What shipped |
|---|---|
| 96 | X25519 tunnel encryption, traffic obfuscation |
| 95 | Device tracking API, JWT authentication |
| 94 | Kalman filter sensor fusion |
| 93 | Friends, location sharing, ghost mode |

---

## License

Proprietary commercial software. All rights reserved.

See [LICENSE.md](LICENSE.md). No production, hosted, resale, SaaS, or white-label rights are granted without a written paid license agreement from **onazi Treasure Oj**.
