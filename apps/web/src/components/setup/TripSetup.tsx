'use client';
import {useState, type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {useQuery} from '@tanstack/react-query';
import {api} from '@/lib/api/client';
import type {RecoveryPolicy} from '@/types';

export default function TripSetup(){
  const router=useRouter();
  const {data,error:locationError}=useQuery({queryKey:['locations'],queryFn:api.locations});
  const [pickup,setPickup]=useState('VIT Chennai');
  const [dropoff,setDropoff]=useState('Chennai Airport');
  const [fare,setFare]=useState(650);
  const [attempts,setAttempts]=useState(2);
  const [auto,setAuto]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function submit(e:FormEvent){
    e.preventDefault();setError('');
    const from=data?.locations.find(x=>x.label===pickup);
    const to=data?.locations.find(x=>x.label===dropoff);
    if(!from||!to||pickup===dropoff){setError('Choose different pickup and drop-off locations.');return;}
    const policy:RecoveryPolicy={auto_rebook_on_confirmed_driver_cancel:auto,
      max_total_fare_inr:fare,max_recovery_attempts:attempts,
      preemptive_switch_requires_approval:true,allow_same_provider_retry:true};
    setBusy(true);
    try{const j=await api.createJourney(from,to,policy);router.push(`/quotes?journey=${j.id}`)}
    catch(err){setError(err instanceof Error?err.message:'Could not start journey.')}
    finally{setBusy(false)}
  }
  return <form className="panel stack" onSubmit={submit}>
    <h2>Where are we taking you?</h2>
    <div className="form-row"><label>Pickup
      <select value={pickup} onChange={e=>setPickup(e.target.value)}>{data?.locations.map(x=><option key={x.label}>{x.label}</option>)}</select>
      </label><label>Destination
      <select value={dropoff} onChange={e=>setDropoff(e.target.value)}>{data?.locations.map(x=><option key={x.label}>{x.label}</option>)}</select>
    </label></div>
    <hr className="divider"/><h3>Your safety limits</h3>
    <div className="form-row"><label>Maximum fare (₹)
      <input type="number" min={100} max={10000} value={fare} onChange={e=>setFare(Number(e.target.value))}/>
    </label><label>Maximum recovery attempts
      <select value={attempts} onChange={e=>setAttempts(Number(e.target.value))}><option value={0}>0</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select>
    </label></div>
    <label className="checkline"><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/>
      Automatically rebook after a confirmed driver cancellation</label>
    <p className="helper">We will never cancel an active ride just because pickup risk is high. You approve preemptive switches.</p>
    {error&&<div className="error">{error}</div>}{locationError&&<div className="error">Connect the API backend at localhost:8000.</div>}
    <button className="btn" disabled={busy||!data} type="submit">{busy?'Preparing simulated quotes…':'Compare simulated rides →'}</button>
  </form>;
}
