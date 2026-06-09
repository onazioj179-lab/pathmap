# PathMap

**Private, encrypted live-location tracking with a map UI that feels like a native app.**

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688?logo=fastapi&logoColor=white)
![Rust](https://img.shields.io/badge/Core-Rust-DEA584?logo=rust&logoColor=white)
![License](https://img.shields.io/badge/license-see%20LICENSE-blue)

PathMap shows people and places on a live map in real time — and the server never sees your
coordinates. Each device encrypts its location before it ever leaves the phone, so the server
only handles ciphertext.

It's a full-stack project: a polished React map front-end, a Python routing back-end, and an
optional Rust core for fast pathfinding. Self-hosted and open — run it, read it, make it yours.

---

## Highlights

- **Encrypted live tracking** — end-to-end; the server sees ciphertext only.
- **Apple Maps-style interface** — a floating search bar, a frosted map-control cluster, and a
  free-form bottom sheet that becomes a sidebar on desktop. Responsive from phone to wide screen.
- **Search anywhere** — type a place, the map flies there and routes to it.
- **Smart routing** — A\*, Dijkstra and greedy search over OpenStreetMap. No paid routing API.
- **Command palette** — press `Cmd/Ctrl-K` to drive the whole app from the keyboard.
- **Live telemetry HUD** — watch frame rate, GPS quality, and the secure connection in real time.
- **Built for everyone** — full keyboard navigation, reduced-motion, high-contrast, and text scaling.
- **Always-on** — auto-reconnect, offline buffering, and battery-aware sampling.

---

## Screenshots

> Add a screenshot or short GIF here (the live map, the search, and the bottom sheet).
> `docs/` is a good place to keep them.

---

## Quick start

You need **Python 3.11+** and **Node 18+**.

**One click (Windows):** double-click **`START PATHMAP.bat`** — it starts both servers and opens
the app in your browser.

**Or run the two halves yourself:**

```bash
# Back-end  → http://localhost:8000
cd backend
pip install -r requirements.txt
uvicorn main:app --port 8000

# Front-end → http://localhost:3002
cd frontend
npm install
npm run dev
```

Then open <http://localhost:3002>. The back-end ships with a small sample street map, so routing
works out of the box.

---

## How it's built

| Layer | Tech |
| --- | --- |
| Front-end | React + TypeScript + Vite, MapLibre GL |
| Back-end | FastAPI (Python), WebSockets, OpenStreetMap routing |
| Fast core | Optional Rust A\* via PyO3, with a pure-Python fallback |
| Encryption | ECDH P-256 + HKDF-SHA256 + AES-256-GCM |

The control surface, live telemetry, always-on, and encryption layers are documented in
**[docs/control-telemetry-encryption.md](docs/control-telemetry-encryption.md)**.

---

## Develop

```bash
# Front-end checks
cd frontend
npm run typecheck
npm test

# Back-end tests
cd backend
pytest
```

---

## Author

Built by **Onazi Treasure**.

## License

Self-hosted and open. See **[LICENSE.md](LICENSE.md)**.
