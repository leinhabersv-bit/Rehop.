"""Reproducible *starter smoke report*; not an empirical field-performance study."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys
from datetime import datetime, timezone

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'services'/'api'))
from app.simulation.engine import Session, LOCATIONS, SCENARIOS, SimulationError
from app.schemas.models import JourneyCreate, RecoveryPolicy


def run(seed:int):
    results=[]
    for scenario_id in SCENARIOS:
        policy=RecoveryPolicy(max_total_fare_inr=330) if scenario_id=='S07' else RecoveryPolicy()
        session=Session(JourneyCreate(pickup=LOCATIONS[0],dropoff=LOCATIONS[1],policy=policy), scenario_id, seed)
        uber=next(q for q in session.quotes if q['provider']=='UBER_SIM')
        try:session.book(uber['quote_id'],f'benchmark-{scenario_id}')
        except SimulationError:pass
        if scenario_id=='S11':session.cancel('benchmark-stop')
        session.tick(25)
        results.append({
            'scenario':scenario_id,'journey_state':session.state,
            'risk_band':session.risk['band'] if session.risk else None,
            'recovery_attempts':session.recovery_attempts,
            'driver_cancelled_events':sum(e['type']=='DRIVER_CANCELLED' for e in session.events),
            'active_ride_count':int(session.ride is not None and session.ride['state'] in {'CONFIRMED','DRIVER_EN_ROUTE','DRIVER_ARRIVED','IN_PROGRESS'}),
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
    print(f'Wrote {out}; {12*args.runs} simulated scenario executions. No real-world accuracy claim.')
