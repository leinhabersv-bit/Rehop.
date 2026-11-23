from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

BASE_TIME = datetime(2026, 11, 23, 8, 30, tzinfo=UTC)

def test_full_booking_flow_and_safety_invariants():
    # 1. Locations check
    loc_resp = client.get('/api/v1/locations')
    assert loc_resp.status_code == 200
    locations = loc_resp.json()['locations']
    assert len(locations) >= 2
    pickup = locations[0]
    dropoff = locations[1]

    # 2. Intent parsing
    intent_resp = client.post('/api/v1/intent/parse', json={'text': 'From VIT Chennai to Chennai Airport within 20 mins under 800'})
    assert intent_resp.status_code == 200
    intent = intent_resp.json()
    assert intent['requires_confirmation'] is True

    # 3. Validation: same pickup and destination rejected
    same_resp = client.post('/api/v1/journeys', json={
        'pickup': pickup,
        'dropoff': pickup,
        'policy': {'max_total_fare_inr': 700},
        'need_by': (BASE_TIME + timedelta(minutes=20)).isoformat()
    })
    assert same_resp.status_code == 422

    # 4. Validation: need_by requires timezone offset
    naive_resp = client.post('/api/v1/journeys', json={
        'pickup': pickup,
        'dropoff': dropoff,
        'need_by': '2026-11-23T08:50:00'  # missing timezone
    })
    assert naive_resp.status_code == 422

    # 5. Create journey successfully
    need_by = (BASE_TIME + timedelta(minutes=20)).isoformat()
    create_resp = client.post('/api/v1/journeys', json={
        'pickup': pickup,
        'dropoff': dropoff,
        'policy': {
            'max_total_fare_inr': 700,
            'max_recovery_attempts': 2,
            'auto_rebook_on_confirmed_driver_cancel': True,
            'max_cancellation_fee_inr': 100
        },
        'need_by': need_by
    })
    assert create_resp.status_code == 201
    journey = create_resp.json()
    journey_id = journey['id']
    assert journey['state'] == 'WAITING_FOR_RIDE'
    assert len(journey['quotes']) == 4
    providers = {q['provider'] for q in journey['quotes']}
    assert providers == {'PROVIDER_A', 'PROVIDER_B', 'PROVIDER_C', 'PROVIDER_D'}

    # 6. Booking rejection: quote not found
    bad_quote = client.post(f'/api/v1/journeys/{journey_id}/book', json={
        'quote_id': 'non_existent_quote_id',
        'idempotency_key': 'key-bad-quote'
    })
    assert bad_quote.status_code == 409
    assert bad_quote.json()['error']['code'] == 'QUOTE_NOT_FOUND'

    # 7. Booking rejection: fare exceeds budget limit
    expensive_quote = next((q for q in journey['quotes'] if q['estimated_fare_inr'] > 700), None)
    if expensive_quote:
        over_budget = client.post(f'/api/v1/journeys/{journey_id}/book', json={
            'quote_id': expensive_quote['quote_id'],
            'idempotency_key': 'key-over-budget'
        })
        assert over_budget.status_code == 409
        assert over_budget.json()['error']['code'] == 'POLICY_FARE_LIMIT'

    # 8. Successful booking with valid quote
    valid_quote = next(q for q in journey['quotes'] if q['estimated_fare_inr'] <= 700)
    book_resp = client.post(f'/api/v1/journeys/{journey_id}/book', json={
        'quote_id': valid_quote['quote_id'],
        'idempotency_key': 'key-valid-booking',
        'expected_version': journey['version']
    })
    assert book_resp.status_code == 200
    booked_journey = book_resp.json()
    assert booked_journey['state'] == 'MONITORING'
    assert booked_journey['active_ride_id'] is not None
    assert booked_journey['active_ride']['driver_id'] == 'SIM_DRIVER_1'
    assert booked_journey['active_ride']['state'] == 'DRIVER_EN_ROUTE'
    assert booked_journey['active_ride']['provider'] == valid_quote['provider']

    # 9. Duplicate booking attempt rejected
    dup_resp = client.post(f'/api/v1/journeys/{journey_id}/book', json={
        'quote_id': journey['quotes'][0]['quote_id'],
        'idempotency_key': 'key-different-attempt'
    })
    assert dup_resp.status_code == 409
    assert dup_resp.json()['error']['code'] == 'ACTIVE_RIDE_EXISTS'

    # 10. Snapshot verification
    get_resp = client.get(f'/api/v1/journeys/{journey_id}')
    assert get_resp.status_code == 200
    snap = get_resp.json()
    assert snap['id'] == journey_id
    assert snap['active_ride']['driver_id'] == 'SIM_DRIVER_1'

    # 11. Events timeline includes RIDE_CONFIRMED
    evt_resp = client.get(f'/api/v1/journeys/{journey_id}/events')
    assert evt_resp.status_code == 200
    event_types = [e['type'] for e in evt_resp.json()['events']]
    assert 'JOURNEY_CREATED' in event_types
    assert 'QUOTES_READY' in event_types
    assert 'RIDE_CONFIRMED' in event_types
