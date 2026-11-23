from app.intelligence.risk import assess
from app.intelligence.policy import may_rebook


def test_stale_gps_is_unknown_not_high():
    r = assess(stationary_duration_s=300, eta_delta_s=500,
               distance_to_pickup_m=1900, gps_age_s=60, gps_quality='POOR')
    assert r['band'] == 'UNKNOWN'


def test_nearby_driver_not_flagged_stalled():
    r = assess(stationary_duration_s=300, eta_delta_s=500,
               distance_to_pickup_m=80, gps_age_s=0, gps_quality='GOOD')
    assert r['band'] == 'LOW'


def test_price_and_cancel_limits_are_absolute():
    args=dict(journey_state='MONITORING',active_ride_state=None,attempts=0,
              max_attempts=2,quote_fare_inr=750,max_fare_inr=650,
              original_cancel_confirmed=True)
    assert may_rebook(**args)[0] is False
    args.update(quote_fare_inr=300,active_ride_state='DRIVER_EN_ROUTE')
    assert may_rebook(**args)[0] is False
