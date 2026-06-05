"""Tests for tunnel session registration + location persistence.

Covers the path that makes the tracker actually work: a client registers its
tunnel session with a bearer token, then location updates are attributed to that
user and written to the sharing store.
"""
import json

from api import tunnel_api
from auth import get_jwt_handler


async def test_register_then_location_is_persisted():
    session_id = "testsess_track_ok"
    token = get_jwt_handler().create_token("user-track-1", "tracker", "t@example.com")

    reg = json.loads(await tunnel_api._handle_tunnel_register(session_id, {"token": token}))
    assert reg["type"] == "tunnel_registered"
    assert reg["user_id"] == "user-track-1"
    assert tunnel_api.session_users[session_id] == "user-track-1"

    ack = json.loads(await tunnel_api._handle_location_update(
        session_id, {"location": {"lat": 9.082, "lng": 7.49, "accuracy": 5}}
    ))
    assert ack["received"] is True
    assert tunnel_api.latest_locations["user-track-1"]["lat"] == 9.082

    # cleanup module state so we don't leak between tests
    tunnel_api.session_users.pop(session_id, None)


async def test_register_rejects_invalid_token():
    reg = json.loads(await tunnel_api._handle_tunnel_register("s_bad", {"token": "not.a.jwt"}))
    assert reg["type"] == "tunnel_register_failed"
    assert "s_bad" not in tunnel_api.session_users


async def test_location_rejected_when_session_unregistered():
    ack = json.loads(await tunnel_api._handle_location_update(
        "session_never_registered", {"location": {"lat": 1.0, "lng": 2.0}}
    ))
    assert ack["received"] is False
    assert ack["reason"] == "unauthenticated"
