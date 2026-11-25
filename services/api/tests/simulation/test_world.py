from datetime import timedelta
from random import Random

from app.schemas.enums import Provider
from app.simulation.engine import BASE_TIME, LOCATIONS
from app.simulation.profiles import PROFILES
from app.simulation.world import DriverSim, MotionMode


def test_world_modes_and_json_roundtrip():
    profile = PROFILES[Provider.PROVIDER_A]
    rng = Random(42)
    driver = DriverSim.create("ride", LOCATIONS[0], profile, rng, sampled=False)
    assert len(driver.route) == 20
    first = driver.tick(BASE_TIME, profile, rng)
    assert first.distance_to_pickup_m < driver.initial_distance_m
    driver.force_mode(MotionMode.STOPPED, 1)
    stopped = driver.tick(BASE_TIME + timedelta(seconds=5), profile, rng)
    assert stopped.distance_to_pickup_m == first.distance_to_pickup_m
    resumed = driver.tick(BASE_TIME + timedelta(seconds=10), profile, rng)
    assert resumed.distance_to_pickup_m < stopped.distance_to_pickup_m
    driver.force_mode(MotionMode.STALLED)
    driver = DriverSim.model_validate_json(driver.model_dump_json())
    assert driver.tick(BASE_TIME, profile, rng).distance_to_pickup_m == resumed.distance_to_pickup_m
    driver.force_mode(MotionMode.DETOUR)
    assert driver.tick(BASE_TIME, profile, rng).distance_to_pickup_m > resumed.distance_to_pickup_m
    driver.force_mode(MotionMode.GPS_LOST)
    assert driver.tick(BASE_TIME, profile, rng) is None
