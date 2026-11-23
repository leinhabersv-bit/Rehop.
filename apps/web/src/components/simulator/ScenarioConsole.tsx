'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {useQuery} from '@tanstack/react-query';
import {api} from '@/lib/api/client';
export default function ScenarioConsole(){
  const router=useRouter();const {data,error}=useQuery({queryKey:['scenarios'],queryFn:api.scenarios});
  const [busy,setBusy]=useState<string|null>(null);const [message,setMessage]=useState('');
  async function start(id:string){setBusy(id);setMessage('');try{const j=await api.scenarioRun(id);router.push(`/journey/${j.id}`)}
    catch(e){setMessage(e instanceof Error?e.message:'Could not start simulation')}finally{setBusy(null)}}
  return <><span className="eyebrow">Developer console · Synthetic data</span><h1>Test recovery, not just booking.</h1>
    <p className="lead">Twelve deterministic scenarios exercise movement, false alarms, cancellations, spending limits and uncertainty.</p>
    {message&&<div className="error">{message}</div>}{error&&<div className="error">Backend unavailable.</div>}
    <div className="scenario-list">{data?.scenarios.map(s=><section className="panel scenario" key={s.id}>
      <span className="badge">{s.id} · Simulated</span><h3>{s.name}</h3>
      <p>Start a backend-driven journey, then advance the simulator clock.</p>
      <button className="btn small" disabled={busy!==null} onClick={()=>start(s.id)}>{busy===s.id?'Starting…':'Run scenario →'}</button>
    </section>)}</div>
    <div className="inline-note" style={{marginTop:25}}>The initial starter implements representative behavior for all twelve scenario IDs; the team must expand the adversarial and concurrency test suite before submission. Scenario S12 intentionally leaves a booking outcome unresolved.</div>
  </>
}
