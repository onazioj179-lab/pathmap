"""End-to-end crypto tests for the encrypted tunnel (protocol v2, P-256).

The "client" side here is an independent reimplementation of the spec using
raw `cryptography` primitives, so it genuinely verifies that the real
TunnelEngine derives the same keys and that AES-256-GCM round-trips in BOTH
directions. The same spec is implemented in the browser
(frontend/src/services/tunnelService.ts).
"""
import os
import json
import base64
import hashlib

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from security.tunnel_engine import TunnelEngine

_ENC = serialization.Encoding.X962
_FMT = serialization.PublicFormat.UncompressedPoint


def _client_derive(shared: bytes, client_pub: bytes, server_pub: bytes, rotation: int = 0):
    """Independent client-side key derivation matching the engine spec."""
    salt = hashlib.sha256(b"pathmap-tunnel-v2" + client_pub + server_pub).digest()
    info = b"pathmap-tunnel-keys:" + str(rotation).encode()
    okm = HKDF(algorithm=hashes.SHA256(), length=64, salt=salt, info=info).derive(shared)
    return okm[:32], okm[32:]  # key_c2s, key_s2c


def _new_client():
    priv = ec.generate_private_key(ec.SECP256R1())
    pub = priv.public_key().public_bytes(_ENC, _FMT)
    return priv, pub


def test_handshake_and_bidirectional_roundtrip():
    eng = TunnelEngine()
    session_id, server_pub = eng.create_session()
    assert len(server_pub) == 65 and server_pub[0] == 0x04

    client_priv, client_pub = _new_client()
    assert eng.complete_handshake(session_id, client_pub) is True

    # Client computes the shared secret + directional keys independently.
    server_pubkey = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), server_pub)
    shared = client_priv.exchange(ec.ECDH(), server_pubkey)
    key_c2s, key_s2c = _client_derive(shared, client_pub, server_pub)

    # ---- client -> server ----
    msg = json.dumps({"type": "location_update", "location": {"lat": 1.0, "lng": 2.0}}).encode()
    nonce = os.urandom(12)
    ct = AESGCM(key_c2s).encrypt(nonce, msg, session_id.encode())
    envelope = json.dumps({
        "n": base64.b64encode(nonce).decode(),
        "ct": base64.b64encode(ct).decode(),
    })
    assert eng.decrypt_message(session_id, envelope) == msg

    # ---- server -> client ----
    reply = eng.encrypt_message(session_id, b'{"type":"location_ack"}')
    assert reply is not None
    obj = json.loads(reply)
    pt = AESGCM(key_s2c).decrypt(
        base64.b64decode(obj["n"]), base64.b64decode(obj["ct"]), session_id.encode()
    )
    assert pt == b'{"type":"location_ack"}'


def test_handshake_rejects_wrong_curve_key_length():
    eng = TunnelEngine()
    session_id, _ = eng.create_session()
    # A 32-byte (X25519-style) key is not a valid P-256 point -> handshake fails,
    # it must not raise or establish.
    assert eng.complete_handshake(session_id, os.urandom(32)) is False


def test_tampered_ciphertext_is_rejected():
    eng = TunnelEngine()
    session_id, server_pub = eng.create_session()
    client_priv, client_pub = _new_client()
    eng.complete_handshake(session_id, client_pub)
    server_pubkey = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), server_pub)
    shared = client_priv.exchange(ec.ECDH(), server_pubkey)
    key_c2s, _ = _client_derive(shared, client_pub, server_pub)

    nonce = os.urandom(12)
    ct = bytearray(AESGCM(key_c2s).encrypt(nonce, b"secret", session_id.encode()))
    ct[-1] ^= 0x01  # flip a bit in the GCM tag
    envelope = json.dumps({
        "n": base64.b64encode(nonce).decode(),
        "ct": base64.b64encode(bytes(ct)).decode(),
    })
    assert eng.decrypt_message(session_id, envelope) is None


def test_replayed_envelope_is_rejected():
    """An identical (nonce, ciphertext) envelope must decrypt at most once."""
    eng = TunnelEngine()
    session_id, server_pub = eng.create_session()
    client_priv, client_pub = _new_client()
    eng.complete_handshake(session_id, client_pub)
    server_pubkey = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), server_pub)
    shared = client_priv.exchange(ec.ECDH(), server_pubkey)
    key_c2s, _ = _client_derive(shared, client_pub, server_pub)

    msg = json.dumps({"type": "location_update", "location": {"lat": 1.0, "lng": 2.0}}).encode()
    nonce = os.urandom(12)
    ct = AESGCM(key_c2s).encrypt(nonce, msg, session_id.encode())
    envelope = json.dumps({
        "n": base64.b64encode(nonce).decode(),
        "ct": base64.b64encode(ct).decode(),
    })

    # First delivery succeeds; the exact same envelope replayed is rejected.
    assert eng.decrypt_message(session_id, envelope) == msg
    assert eng.decrypt_message(session_id, envelope) is None
    assert eng.ai_model.replay_attempts >= 1
