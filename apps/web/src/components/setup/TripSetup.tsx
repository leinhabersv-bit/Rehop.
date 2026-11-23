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
  const [needIn,setNeedIn]=useState(20);
  const [requestText,setRequestText]=useState('');
  const [interpretation,setInterpretation]=useState('');
  const [attempts,setAttempts]=useState(2);
  const [maxFee,setMaxFee]=useState(100);
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
      preemptive_switch_requires_approval:true,allow_same_provider_retry:true,max_cancellation_fee_inr:maxFee};
    setBusy(true);
    try{const j=await api.createJourney(from,to,policy,new Date(Date.parse('2026-11-23T08:30:00Z')+needIn*60000).toISOString());router.push(`/quotes?journey=${j.id}`)}
    catch(err){setError(err instanceof Error?err.message:'Could not start journey.')}
    finally{setBusy(false)}
  }
  return <form className="panel stack" onSubmit={submit}>
    <h2>Where are we taking you?</h2>
    <label>Describe your trip (AI interpretation, confirmation required)
      <textarea rows={2} maxLength={500} value={requestText} onChange={e=>setRequestText(e.target.value)} placeholder="From VIT Chennai to Chennai Airport, pickup within 15 minutes"/>
    </label>
    <button className="btn small secondary" type="button" disabled={!requestText.trim()||busy} onClick={async()=>{
      setBusy(true);try{const v=await api.parseIntent(requestText);if(v.pickup)setPickup(v.pickup);if(v.dropoff)setDropoff(v.dropoff);
      if(v.need_in_minutes)setNeedIn(v.need_in_minutes);
      setInterpretation(`Interpreted by ${v.source}. Review every field before booking.`);}
      catch(e){setInterpretation(e instanceof Error?e.message:'Could not interpret request');}finally{setBusy(false)}
    }}>Interpret request</button>
    {interpretation&&<p className="helper">{interpretation}</p>}
    <div className="form-row"><label>Pickup
      <select value={pickup} onChange={e=>setPickup(e.target.value)}>{data?.locations.map(x=><option key={x.label}>{x.label}</option>)}</select>
      </label><label>Destination
      <select value={dropoff} onChange={e=>setDropoff(e.target.value)}>{data?.locations.map(x=><option key={x.label}>{x.label}</option>)}</select>
    </label></div>
    <label>Pickup needed within (simulated minutes)
      <input type="number" min={5} max={120} value={needIn} onChange={e=>setNeedIn(Math.max(5,Math.min(120,Number(e.target.value))))}/>
    </label>
    <hr className="divider"/><h3>Your safety limits</h3>
    <div className="form-row"><label>Maximum fare (₹)
      <input type="number" min={100} max={10000} value={fare} onChange={e=>setFare(Number(e.target.value))}/>
    </label><label>Maximum recovery attempts
      <select value={attempts} onChange={e=>setAttempts(Number(e.target.value))}><option value={0}>0</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select>
    </label></div>
    <label>Maximum possible cancellation fee (₹)
      <select value={maxFee} onChange={e=>setMaxFee(Number(e.target.value))}><option value={0}>₹0</option><option value={50}>₹50</option><option value={100}>₹100</option></select>
    </label>
    <label className="checkline"><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/>
      Automatically rebook after a confirmed driver cancellation</label>
    <p className="helper">We will never cancel an active ride just because pickup risk is high. You approve preemptive switches.</p>
    {error&&<div className="error">{error}</div>}{locationError&&<div className="error">Connect the API backend at localhost:8000.</div>}
    <button className="btn" disabled={busy||!data} type="submit">{busy?'Preparing simulated quotes…':'Compare simulated rides →'}</button>
  </form>;
}
