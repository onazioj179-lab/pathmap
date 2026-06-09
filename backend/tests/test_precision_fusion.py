"""Sensor-fusion bounds tests for the precision tracking EKF."""

import math

from location.precision_tracking_engine import ExtendedKalmanFilter


def test_first_gps_initializes_filter():
    ekf = ExtendedKalmanFilter()
    # update_gps before initialize() should bootstrap, not crash.
    ekf.update_gps(9.05, 7.49, accuracy=4.0, heading=90.0)
    assert ekf.initialized
    lat, lon, _, _ = ekf.get_state()
    assert abs(lat - 9.05) < 1e-6
    assert abs(lon - 7.49) < 1e-6


def test_fused_state_stays_within_measurement_neighborhood():
    ekf = ExtendedKalmanFilter()
    ekf.initialize(9.05, 7.49, 0.0)
    for lat, lon in [(9.0501, 7.4901), (9.0502, 7.4902), (9.0503, 7.4903)]:
        ekf.predict(1.0)
        ekf.update_gps(lat, lon, accuracy=5.0)

    lat, lon, heading, speed = ekf.get_state()
    assert 9.049 <= lat <= 9.051
    assert 7.489 <= lon <= 7.491
    assert 0.0 <= heading < 360.0
    assert speed >= 0.0

    pos_acc, head_acc = ekf.get_accuracy()
    assert math.isfinite(pos_acc) and pos_acc >= 0
    assert math.isfinite(head_acc) and head_acc >= 0


def test_estimate_converges_toward_repeated_measurement():
    ekf = ExtendedKalmanFilter()
    ekf.initialize(9.0, 7.0, 0.0)
    target = (9.001, 7.001)
    for _ in range(20):
        ekf.predict(1.0)
        ekf.update_gps(target[0], target[1], accuracy=5.0)

    lat, lon, _, _ = ekf.get_state()
    # The fused estimate must move closer to the measurement than it started.
    assert abs(lat - target[0]) < abs(9.0 - target[0])
    assert abs(lon - target[1]) < abs(7.0 - target[1])
