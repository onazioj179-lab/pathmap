PathMap – Encrypted Real‑Time Location for Private Teams

PathMap is a proprietary commercial location‑tracking platform designed for operations teams, private fleets, and regulated deployments. It encrypts device locations end‑to‑end so that even the server cannot read your team’s coordinates. All production, hosted, resale, SaaS, or commercial use requires a paid license—it is not free.

Key Features
Encrypted live map: Real‑time team tracking where servers only see ciphertext.
Private team coordination: Share locations securely, without exposing raw coordinates.
Sensor‑smoothed positioning: Combines GPS, accelerometer, gyroscope, and compass for accurate tracks.
Offline routing: A*, Dijkstra, and greedy algorithms over OpenStreetMap without third‑party APIs.
Geofencing & alerts: Trigger notifications for entering or exiting zones.
Ghost mode & traffic obfuscation: Pause broadcasts or add decoy traffic for privacy.
Deployment control: Run your own backend and keep billing, secrets, and infrastructure in‑house.

Security Basics
End‑to‑end encrypted payloads with AES‑256‑GCM and X25519 ECDH key exchange.
Server only routes messages; it cannot decrypt locations.
Session keys rotate every 300 seconds or 10,000 messages.

Pricing (Not Free)
Plan
Price
Includes
Starter
$19 / seat / month
5 devices, encrypted maps, route sharing, deployment guidance.
Pro
$49 / seat / month
25 devices, production license, priority safety/routing/diagnostics.
Enterprise
Custom annual contract
Device limits by agreement, private deployment support, dedicated terms.

Important: Evaluation is allowed, but any production or commercial use requires a paid license.

Quick Start Snapshot
Launch backend: uvicorn main:app --host 0.0.0.0 --port 8000  
Register a user via /api/v1/social/register  
Open an encrypted WebSocket tunnel  
Send encrypted location updates

PathMap is built for teams that need control, privacy, and reliable operations, and it does not offer free production use.