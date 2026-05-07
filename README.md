# PathMap

**Encrypted real-time location tracking for private teams, field operations, and commercial deployments.**

PathMap is location infrastructure for teams that need live coordination without handing sensitive movement data to a third-party tracking cloud. Devices encrypt location updates before they leave the client. The server routes encrypted payloads, but cannot read the location inside them.

Built for operations teams, private fleets, safety workflows, and regulated deployments where location privacy is not optional.

> PathMap is proprietary commercial software by **onazi Treasure Oj**. Local evaluation is allowed. Production use, hosted access, resale, SaaS use, white-label use, or any commercial deployment requires a paid PathMap license. See [Commercial License & Pricing](#commercial-license--pricing) and [LICENSE.md](LICENSE.md).

---

## Why PathMap Exists

Most tracking products force a bad choice:

- Use a polished commercial service and expose sensitive location data to someone else's infrastructure.
- Self-host a tool and lose the reliability, routing, and usability your team actually needs.

PathMap is built for teams that need both control and a real operating experience: encrypted live tracking, team coordination, routing, geofencing, and deployment ownership.

**Primary user:** an operations lead managing 10-50 mobile workers who needs real-time visibility without trusting a third-party platform with location data.

---

## What You Get

| Capability | What it gives your team |
|---|---|
| **Encrypted live map** | Track devices in real time while keeping location payloads unreadable to the server. |
| **Private team coordination** | Share location between authorized users without exposing raw coordinates to the backend. |
| **Sensor-smoothed positioning** | GPS, accelerometer, gyroscope, and compass fusion reduce jumpy tracks and false alerts. |
| **Offline-capable routing** | A*, Dijkstra, and greedy routing over OpenStreetMap graphs without paid external routing APIs. |
| **Geofencing** | Trigger entry and exit alerts for operational zones. |
| **Ghost mode** | Pause broadcasting while maintaining online presence when safety or privacy requires it. |
| **Traffic obfuscation** | Add padding, timing jitter, and decoy messages to reduce metadata clarity. |
| **Deployment control** | Run your own backend and connect your own database, billing, secrets, and infrastructure. |

---

## Security Model

PathMap is designed around a simple promise: **the server should not be able to read location payloads.**

Location updates are encrypted client-to-client. The backend handles accounts, sessions, geofences, and message routing. It does not need plaintext location data to operate.

```
[Client Device] --TLS--> [PathMap Server] --TLS--> [Recipient Device]
       |                         |                         |
       +------- end-to-end encrypted location payload ------+
                         server sees ciphertext only
```

### Protects Against

- Passive server compromise: encrypted payloads remain opaque.
- Network interception: TLS plus application-layer encryption protect data in transit.
- Basic token theft: short-lived tokens and refresh rotation limit exposure.

### Does Not Protect Against

- Compromised client devices: if the endpoint is owned, location data is exposed.
- Traffic analysis: timing and packet sizes can still reveal metadata.
- Targeted key extraction: no HSM integration; keys live in process memory.

### Cryptography

| Layer | Algorithm | Notes |
|---|---|---|
| Key exchange | X25519 ECDH | Requires the Python `cryptography` package. |
| Payload encryption | AES-256-GCM | 96-bit nonces with counter tracking. |
| Key derivation | HKDF-SHA256 | Per-session keys. |
| Authentication | HMAC-SHA256 | Short-lived JWT-style tokens. |
| Password storage | bcrypt | Cost factor 12. |

Session keys rotate automatically every 300 seconds or after 10,000 messages.

> Security requirement: install the Python `cryptography` package before using PathMap with real data. Without it, the system falls back to weak XOR obfuscation and logs a warning. That fallback is for development only and should not be treated as secure.

---

## Commercial License & Pricing

PathMap is not open-source freeware. This repository is available for evaluation, review, and authorized development only. It does not grant production, hosted, resale, SaaS, or white-label rights.

| Plan | Price | Intended use | Includes |
|---|---|---|---|
| **Starter** | $19 / seat / month | Small teams evaluating private encrypted tracking. | Up to 5 tracked devices, encrypted live map, route sharing, deployment guidance. |
| **Pro** | $49 / seat / month | Field operations needing production controls. | Up to 25 tracked devices, commercial production license, priority safety/routing/diagnostics workflows. |
| **Enterprise** | Custom annual contract | Regulated teams and private deployments. | Device limits by agreement, security review, private deployment support, dedicated terms. |

Payment processing is intentionally not bundled in this repository. Production operators should connect their approved billing provider, subscription ledger, and license enforcement service before offering hosted access.

For licensing or Enterprise terms, contact **onazi Treasure Oj**.

---

## Quick Start

### 1. Start the backend

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

### 4. Send a location update

```javascript
const encrypted = aesGcmEncrypt(sharedSecret, JSON.stringify({
  lat: 40.7128,
  lon: -74.0060,
  accuracy: 10,
  timestamp: Date.now(),
}));

ws.send(JSON.stringify({ type: "location", payload: encrypted }));
```

### Common Responses

| Response | Meaning | Fix |
|---|---|---|
| `401` | Token expired. | Refresh the token and retry. |
| `429` | Rate limited. | Back off for 60 seconds. |
| `handshake_failed` | Key exchange failed. | Regenerate the keypair and reconnect. |

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

Add a PostgreSQL service to `docker-compose.yml` before production use.

### Kubernetes

```bash
kubectl apply -f k8s/
```

The manifests deploy the backend and PostgreSQL StatefulSet. Ingress, TLS termination, secrets management, observability, and billing are intentionally left to the production operator.

---

## Failure Behavior

| Failure | Behavior | Recovery |
|---|---|---|
| Database unavailable | New authentication fails; active sessions continue. | Exponential backoff reconnect. |
| WebSocket disconnect | Client queues updates locally. | Auto-reconnect with replay. |
| Crypto library missing | Weak obfuscation fallback with startup warning. | Install `cryptography`. |
| OSM graph load failure | Routing becomes unavailable; tracking continues. | Restart with a valid graph. |

---

## Known Limits

- No iOS or Android app is included; the repository provides web/backend infrastructure.
- No HIPAA, SOC 2, GDPR, or other compliance certification is included.
- No sub-meter accuracy; consumer GPS hardware limits still apply.
- No indoor positioning through WiFi, BLE, or beacon systems.
- No historical location warehouse, replay system, or heatmap analytics.
- No multi-region replication or HSM-backed key storage out of the box.

PathMap is encrypted location infrastructure for teams building private tracking systems. It is not a turnkey consumer app.

---

## Architecture Notes

**Backend:** FastAPI for async WebSocket handling, Pydantic validation, and high-concurrency routing.

**Realtime transport:** WebSockets for low-overhead 2-second location updates with browser support.

**Storage:** PostgreSQL for accounts, sessions, and geofences. Plaintext location history is not stored by default.

**Routing:** OpenStreetMap graph routing with A*, Dijkstra, and greedy algorithms.

---

## Version History

| Version | Shipped |
|---|---|
| 96 | X25519 tunnel encryption and traffic obfuscation. |
| 95 | Device tracking API and JWT authentication. |
| 94 | Kalman filter sensor fusion. |
| 93 | Friends, location sharing, and ghost mode. |

---

## License

Proprietary commercial software. All rights reserved.

See [LICENSE.md](LICENSE.md). No production, hosted, resale, SaaS, white-label, or commercial-use rights are granted without a written paid license agreement from **onazi Treasure Oj**.