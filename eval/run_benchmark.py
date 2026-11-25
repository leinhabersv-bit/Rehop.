"""Reproducible *starter smoke report*; not an empirical field-performance study."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys
from datetime import timedelta

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'services'/'api'))
from app.simulation.engine import Session, LOCATIONS, SCENARIOS, SimulationError, BASE_TIME
from app.schemas.models import JourneyCreate, RecoveryPolicy
from app.storage.ids import IdFactory


def run(seed:int):
    results=[]
    scenario_ids = IdFactory()
    for scenario_id in SCENARIOS:
        policy = RecoveryPolicy(
            auto_rebook_on_confirmed_driver_cancel=scenario_id in {'S04', 'S05', 'S06', 'S07'},
            max_total_fare_inr=330 if scenario_id == 'S07' else 650,
        )
        request=JourneyCreate(pickup=LOCATIONS[0],dropoff=LOCATIONS[1],policy=policy)
        if scenario_id=='S16': request.need_by=BASE_TIME + timedelta(minutes=5)
        session=Session(request, scenario_id, seed, scenario_ids=scenario_ids)
        primary=next(q for q in session.quotes if q.provider=='PROVIDER_A')
        try:session.book(primary.quote_id,f'benchmark-{scenario_id}')
        except SimulationError:pass
        if scenario_id=='S11':session.cancel('benchmark-stop')
        session.tick(25)
        if scenario_id in {'S14','S15'} and session.pending_backup:
            session.approve_switch(True,f'benchmark-switch-{scenario_id}')
        results.append({
            'scenario':scenario_id,'journey_state':session.state,
            'risk_band':session.risk.band if session.risk else None,
            'recovery_attempts':session.recovery_attempts,
            'driver_cancelled_events':sum(e.type=='DRIVER_CANCELLED' for e in session.events),
            'driver_message_signal':session.driver_chat_signal.label if session.driver_chat_signal else None,
            'deadline_decision':session.decision.recommendation if session.decision else None,
            'quote_refresh_failed':any(e.type=='QUOTE_REFRESH_FAILED' for e in session.events),
            'post_cancel_quote_lost':any(e.type=='REPLACEMENT_QUOTE_LOST' for e in session.events),
            'active_ride_count':int(session.ride is not None and session.ride.state in {'CONFIRMED','DRIVER_EN_ROUTE','DRIVER_ARRIVED','IN_PROGRESS'}),
            'is_simulated':True,
        })
    return results


if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--seed',type=int,default=2026)
    p.add_argument('--runs',type=int,default=1,help='Different simulation seeds; initial scenario behaviors are mostly deterministic')
    args=p.parse_args()
    result=[{'seed':args.seed+i,'scenarios':run(args.seed+i)} for i in range(args.runs)]
    summary={'type':'starter_smoke_report','simulated_only':True,
             'not_real_world_metrics':True,'runs':args.runs,'results':result}
    out=ROOT/'eval'/'results'/'smoke_report.json';out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(summary,indent=2)+'\n')
    print(f'Wrote {out}; {len(SCENARIOS)*args.runs} simulated scenario executions. No real-world accuracy claim.')
