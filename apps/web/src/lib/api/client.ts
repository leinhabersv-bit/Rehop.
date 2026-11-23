import type {Event,Journey,Location,RecoveryPolicy,Scenario} from '@/types';
export const API_BASE=process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
export class ApiError extends Error {constructor(public code:string,message:string){super(message)}}
async function json<T>(path:string, options?:RequestInit):Promise<T> {
  const response=await fetch(`${API_BASE}${path}`,{...options,headers:{'Content-Type':'application/json',...options?.headers},cache:'no-store'});
  const data:unknown=await response.json();
  if (!response.ok) {
    const err=data as {error?:{code?:string;message?:string}};
    throw new ApiError(err.error?.code || 'API_ERROR',err.error?.message || `HTTP ${response.status}`);
  }
  return data as T;
}
const post=<T>(path:string,body:unknown)=>json<T>(path,{method:'POST',body:JSON.stringify(body)});
export const api={
  locations:()=>json<{locations:Location[]}>('/api/v1/locations'),
  scenarios:()=>json<{scenarios:Scenario[]}>('/api/v1/scenarios'),
  scenarioRun:(id:string)=>post<Journey>(`/api/v1/scenarios/${id}/run`,{}),
  createJourney:(pickup:Location,dropoff:Location,policy:RecoveryPolicy,needBy:string)=>post<Journey>('/api/v1/journeys',{pickup,dropoff,policy,need_by:needBy}),
  parseIntent:(text:string)=>post<{pickup:string|null;dropoff:string|null;need_in_minutes:number|null;source:string;requires_confirmation:boolean}>('/api/v1/intent/parse',{text}),
  driverMessage:(id:string,text:string)=>post<Journey>(`/api/v1/journeys/${id}/driver-message`,{text,idempotency_key:crypto.randomUUID()}),
  journey:(id:string)=>json<Journey>(`/api/v1/journeys/${id}`),
  events:(id:string,sinceSeq=0)=>json<{events:Event[];last_event_seq:number}>(`/api/v1/journeys/${id}/events?since_seq=${sinceSeq}`),
  book:(id:string,quoteId:string)=>post<Journey>(`/api/v1/journeys/${id}/book`,{quote_id:quoteId,idempotency_key:crypto.randomUUID()}),
  tick:(id:string,steps=6)=>post<Journey>(`/api/v1/journeys/${id}/tick`,{steps}),
  approve:(id:string,approved:boolean,version:number)=>post<Journey>(`/api/v1/journeys/${id}/rescue/approve`,{approved,expected_version:version,idempotency_key:crypto.randomUUID()}),
  cancel:(id:string)=>post<Journey>(`/api/v1/journeys/${id}/cancel`,{idempotency_key:crypto.randomUUID()}),
  confirmPickup:(id:string)=>post<Journey>(`/api/v1/journeys/${id}/pickup/confirm`,{idempotency_key:crypto.randomUUID()})
};
