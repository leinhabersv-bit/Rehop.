'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {useQuery} from '@tanstack/react-query';
import {api} from '@/lib/api/client';
import {providerName} from '@/types';
export default function QuoteList({id}:{id:string}){
  const router=useRouter();const {data,error}=useQuery({queryKey:['journey',id],queryFn:()=>api.journey(id)});
  const [busy,setBusy]=useState<string|null>(null);const [message,setMessage]=useState('');
  async function book(quoteId:string){setMessage('');setBusy(quoteId);try{await api.book(id,quoteId);router.push(`/journey/${id}`)}
  catch(e){setMessage(e instanceof Error?e.message:'Booking failed')}finally{setBusy(null)}}
  return <div><span className="eyebrow">Step 2 / Compare</span><h1>Choose a simulated ride</h1>
  <p className="lead">Prices and arrival estimates are fictional. These actions do not book a real cab.</p>
  <div className="panel quote-list">{!data?<p>{error?'Could not load quotes. Please check the API.':'Loading simulated offers…'}</p>:
  <><p className="helper">{data.pickup.label} → {data.dropoff.label} · Max fare ₹{data.policy.max_total_fare_inr}</p>
  {data.quotes.map(q=><div className="quote" key={q.quote_id}><div><h3>{providerName[q.provider]} <span className="badge">Simulated</span></h3>
  <div className="meta">Pickup ETA {Math.ceil(q.pickup_eta_sec/60)} min · No real fares</div></div>
  <div className="button-row" style={{alignItems:'center'}}><strong style={{fontSize:23}}>₹{q.estimated_fare_inr}</strong>
  <button className="btn small" disabled={busy!==null||q.estimated_fare_inr>data.policy.max_total_fare_inr} onClick={()=>book(q.quote_id)}>{busy===q.quote_id?'Booking…':'Book simulation'}</button></div></div>)}
  </>}{message&&<div className="error">{message}</div>}</div></div>
}
