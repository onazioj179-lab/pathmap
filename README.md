# PathMap

**Private, encrypted live location tracking you host yourself.**

PathMap lets a team see each other on a live map in real time — without handing location data to a third-party tracking cloud. Devices encrypt their location before it leaves the phone, and the server only ever sees ciphertext. You run the backend; you own the data.

Built for operations leads, private fleets, and safety workflows that need live coordination but can't ship sensitive movement data to someone else's servers.

---

## Open core

PathMap is **open core**:

- **Core (free, self-hosted)** — everything in this repo. Run it yourself, read the code, modify it, use it for your own team. This is the real product, not a demo.
- **Hosted & Enterprise (paid)** — managed hosting, billing, SSO, priority support, and security review. You never need these to run PathMap; they exist for teams that don't want to operate it themselves.

See [Pricing](#hosted--enterprise) and [LICENSE.md](LICENSE.md).

---

## What you get

| Feature | What it does |
| --- | --- |
| **Encrypted live map** | Track devices in real time; the server can't read the coordinates. |
| **Team coordination** | Share location between authorized users, friends, and groups. |
| **Smart routing** | A\*, Dijkstra, and greedy routing over OpenStreetMap — no paid routing API. |
| **Geofencing** | Entry/exit alerts for zones you define. |
| **Ghost mode** | Stay online but pause broadcasting when privacy matters. |
| **Self-hosted** | Your backend, your database, your keys. |

---

## Quick start

You need **Python 3.11+** and **Node 18+**.

### Run everything (Windows)

```powershell
./start-dev.ps1
```

This launches both servers and prints the URLs. Otherwise, run the two halves manually:

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Check it's up: open <http://localhost:8000/health> — you should see `"status": "healthy"`.
API docs live at <http://localhost:8000/docs>.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:3002>.

> **Heads up:** the backend ships with a small sample street graph so it runs out of the box. Point it at a real OpenStreetMap area for production routing.

---

## How the encryption works

The promise is simple: **the server should never be able to read your location.**

```
[Device A] --TLS--> [PathMap server] --TLS--> [Device B]
     |                      |                      |
     +---- end-to-end encrypted location ----------+
                  server sees ciphertext only
```

| Layer | Algorithm |
| --- | --- |
| Key exchange | ECDH P-256 |
| Payload encryption | AES-256-GCM |
| Key derivation | HKDF-SHA256 |
| Passwords | bcrypt (cost 12) |

Tunnel keys are ephemeral per connection; each reconnect performs a fresh ECDH handshake.

> **Important:** install the Python `cryptography` package (it's in `requirements.txt`). Without it, PathMap falls back to weak obfuscation meant only for local development — never run real data without it.

**It protects against** a compromised or snooping server, and network interception.
**It does not protect against** a compromised phone, traffic-timing analysis, or a targeted attacker extracting keys from memory.

---

## Deploy it

```env
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/pathmap
JWT_SECRET_KEY=<openssl rand -hex 32>
CORS_ORIGINS=https://your-domain.com
```

```bash
docker-compose up -d      # Docker
kubectl apply -f k8s/     # Kubernetes
```

TLS termination, secrets management, and a production Postgres are left to you — see [PREFLIGHT.md](PREFLIGHT.md) before going live.

---

## Good to know

- Web + backend only — no native iOS/Android app is included.
- Consumer-GPS accuracy; no indoor or sub-meter positioning.
- No built-in location history warehouse or analytics.
- No compliance certifications (HIPAA, SOC 2, GDPR) out of the box.

---

## Hosted & Enterprise

Don't want to run servers? These are optional, paid add-ons on top of the free core.

| Plan | Price | For |
| --- | --- | --- |
| **Starter** | $19 / seat / mo | Small teams, hosted, up to 5 devices. |
| **Pro** | $49 / seat / mo | Field ops, up to 25 devices, priority support. |
| **Enterprise** | Custom | Private deployment, SSO, security review. |

Contact **Onazi Treasure Oj** for hosted access or Enterprise terms.

---

## Contributing

Issues and pull requests are welcome on the open core. Run the backend tests with `cd backend && pytest` and the frontend checks with `cd frontend && npm test` before opening a PR.

---

## License

Open core. The self-hosted core in this repo is free to run and modify under the terms in [LICENSE.md](LICENSE.md). Hosted access and Enterprise features are sold separately by **Onazi Treasure Oj**.
