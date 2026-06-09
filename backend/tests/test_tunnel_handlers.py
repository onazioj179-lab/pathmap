"""Tunnel application-message handler tests (location, task, route).

These exercise the tunnel_api message handlers directly (the crypto layer is
covered by test_tunnel.py). They assert the registration gate, that a location
update is attributed and kept, that task updates add/remove, and that a route
request always returns a well-formed envelope (never raises) even when the graph
is not loaded in the offline test app.
"""
import json

from api import tunnel_api


async def test_location_update_requires_registration():
    sid = "sess-loc-unreg"
    tunnel_api.session_users.pop(sid, None)
    out = json.loads(
        (await tunnel_api._handle_location_update(sid, {"location": {"lat": 1, "lng": 2}})).decode()
    )
    assert out["received"] is False
    assert out["reason"] == "unauthenticated"


async def test_location_update_persists_for_registered_user():
    sid, uid = "sess-loc", "user-loc"
    tunnel_api.session_users[sid] = uid
    try:
        out = json.loads(
            (
                await tunnel_api._handle_location_update(
                    sid, {"location": {"lat": 9.05, "lng": 7.49, "accuracy": 5}}
                )
            ).decode()
        )
        assert out["received"] is True
        assert tunnel_api.latest_locations[uid]["lat"] == 9.05
        assert tunnel_api.latest_locations[uid]["lng"] == 7.49
    finally:
        tunnel_api.session_users.pop(sid, None)
        tunnel_api.latest_locations.pop(uid, None)


async def test_task_update_add_then_remove():
    sid, uid = "sess-task", "user-task"
    tunnel_api.session_users[sid] = uid
    try:
        add = json.loads(
            (
                await tunnel_api._handle_task_update(
                    sid, {"action": "add", "target": {"id": "t1", "name": "X"}, "reqId": "r1"}
                )
            ).decode()
        )
        assert add["received"] is True and add["reqId"] == "r1"
        assert tunnel_api.latest_tasks[uid]["t1"]["name"] == "X"

        rem = json.loads(
            (
                await tunnel_api._handle_task_update(
                    sid, {"action": "remove", "target": {"id": "t1"}}
                )
            ).decode()
        )
        assert rem["received"] is True
        assert "t1" not in tunnel_api.latest_tasks[uid]
    finally:
        tunnel_api.session_users.pop(sid, None)
        tunnel_api.latest_tasks.pop(uid, None)


async def test_task_update_requires_registration():
    sid = "sess-task-unreg"
    tunnel_api.session_users.pop(sid, None)
    out = json.loads(
        (await tunnel_api._handle_task_update(sid, {"action": "add", "target": {"id": "t"}})).decode()
    )
    assert out["received"] is False


async def test_route_request_returns_wellformed_envelope_when_graph_absent():
    # The offline test app has no graph loaded, so main.route raises (503). The
    # handler must still return a well-formed non-ok route_result rather than
    # raising, so the client can fall back to its HTTP path.
    out = json.loads(
        (
            await tunnel_api._handle_route_request(
                "sess-route", {"reqId": "rr1", "request": {"start": [9.0, 7.4], "end": [9.1, 7.5]}}
            )
        ).decode()
    )
    assert out["type"] == "route_result"
    assert out["reqId"] == "rr1"
    assert "ok" in out
