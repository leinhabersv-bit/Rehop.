from datetime import timedelta
from app.intelligence.llm import classify_driver_message, parse_ride_intent, explain_with_verified_numbers
from app.intelligence.decision import compare_wait_switch
from app.simulation.engine import BASE_TIME, LOCATIONS, Session
from app.schemas.models import JourneyCreate


def test_chat_fallback_classifies_cancel_request_without_authority(monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    assert classify_driver_message('Please cancel kar do')['label'] == 'REQUEST_RIDER_CANCEL'
    assert classify_driver_message('Traffic, 10 min')['label'] == 'TRAFFIC_DELAY'


def test_intent_parser_requires_confirmation(monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    parsed = parse_ride_intent('From VIT Chennai to Chennai Airport within 15 minutes', LOCATIONS)
    assert parsed['pickup']=='VIT Chennai'
    assert parsed['dropoff']=='Chennai Airport'
    assert parsed['need_in_minutes']==15
    assert parsed['requires_confirmation'] is True


def test_explanation_rejects_llm_invented_numbers(monkeypatch):
    from app.intelligence import llm
    monkeypatch.setattr(llm,'_llm_json',lambda *args:{'explanation':'Your ETA is 200 minutes and fare is 9000'})
    checked=explain_with_verified_numbers('Pickup risk is increasing.', [300])
    assert checked['source']=='deterministic_template'


def test_urgency_changes_decision_without_changing_risk():
    args=dict(now=BASE_TIME, current_eta_sec=420, backup_eta_sec=240,
              current_fare_inr=320,backup_fare_inr=285,
              cancellation_fee_upper_bound_inr=32,risk_band='MEDIUM')
    urgent=compare_wait_switch(**args,need_by=BASE_TIME+timedelta(minutes=5))
    relaxed=compare_wait_switch(**args,need_by=BASE_TIME+timedelta(minutes=20))
    assert urgent['recommendation']=='PROPOSE_SWITCH'
    assert relaxed['recommendation']=='WAIT_AND_MONITOR'


def test_scenario_chat_risk_does_not_cancel_ride():
    s=Session(JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1]),scenario='S13')
    s.book(s.quotes[0]['quote_id'],'first')
    s.tick(5)
    assert s.driver_chat_signal['label']=='REQUEST_RIDER_CANCEL'
    assert s.ride['state']=='DRIVER_EN_ROUTE'
    assert any(e['type']=='RISK_SIGNAL_ADDED' for e in s.events)


def test_scenario_quote_refresh_failure_preserves_original():
    s=Session(JourneyCreate(pickup=LOCATIONS[0],dropoff=LOCATIONS[1]),scenario='S14')
    s.book(s.quotes[0]['quote_id'],'first')
    s.tick(22)
    assert s.pending_backup is not None
    old_ride=s.ride['ride_id']
    s.approve_switch(True,'switch')
    assert s.ride['ride_id']==old_ride
    assert not any(e['type']=='RIDE_CANCEL_REQUESTED' for e in s.events)
    assert any(e['type']=='QUOTE_REFRESH_FAILED' for e in s.events)


def test_scenario_post_cancel_quote_failure_not_labeled_success():
    s=Session(JourneyCreate(pickup=LOCATIONS[0],dropoff=LOCATIONS[1]),scenario='S15')
    s.book(s.quotes[0]['quote_id'],'first')
    s.tick(22)
    s.approve_switch(True,'switch')
    assert s.state=='EXHAUSTED' and s.ride is None
    assert any(e['type']=='REPLACEMENT_QUOTE_LOST' for e in s.events)
    assert not any(e['type']=='RECOVERY_SUCCEEDED' for e in s.events)


def test_simulation_offers_are_neutral():
    s=Session(JourneyCreate(pickup=LOCATIONS[0],dropoff=LOCATIONS[1]))
    assert {q['provider'] for q in s.quotes}=={'PROVIDER_A','PROVIDER_B','PROVIDER_C','PROVIDER_D'}


def test_urgent_session_proposes_earlier_than_relaxed_session():
    urgent=Session(JourneyCreate(pickup=LOCATIONS[0],dropoff=LOCATIONS[1],
         need_by=BASE_TIME+timedelta(minutes=5)),scenario='S16')
    relaxed=Session(JourneyCreate(pickup=LOCATIONS[0],dropoff=LOCATIONS[1],
         need_by=BASE_TIME+timedelta(minutes=20)),scenario='S16')
    for sess in (urgent,relaxed):
        sess.book(sess.quotes[0]['quote_id'],'initial')
        sess.tick(9)
    assert urgent.pending_backup is not None
    assert relaxed.pending_backup is None
