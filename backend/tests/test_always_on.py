"""Always-On Live Location resume/lifecycle tests (V54)."""

from location.always_on_live_location import AlwaysOnLiveLocation


def test_grant_permission_auto_starts_tracking():
    aoll = AlwaysOnLiveLocation()
    res = aoll.grant_permission()
    assert res["success"] is True
    assert aoll.tracking_active is True
    assert aoll.watch_id is not None


def test_resume_refreshes_watch_even_when_flag_stale():
    aoll = AlwaysOnLiveLocation()
    aoll.grant_permission()
    first_watch = aoll.watch_id

    # Simulate the watch dying in the background while the flag still reads True.
    res = aoll.handle_app_resume()
    assert res["resumed"] is True
    assert res["was_active"] is True
    assert aoll.tracking_active is True
    # A fresh watch must have been issued.
    assert aoll.watch_id is not None and aoll.watch_id != first_watch


def test_resume_without_permission_does_not_track():
    aoll = AlwaysOnLiveLocation()
    aoll.grant_permission()
    aoll.revoke_permission()

    res = aoll.handle_app_resume()
    assert res["resumed"] is False
    assert res["tracking_active"] is False
    assert aoll.tracking_active is False


def test_last_position_preserved_across_resume():
    aoll = AlwaysOnLiveLocation()
    aoll.grant_permission()
    aoll.update_position(9.05, 7.49, 5.0)
    before = aoll.last_position

    aoll.handle_app_resume()
    assert aoll.last_position == before  # not blanked by the resume
