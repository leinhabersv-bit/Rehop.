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

const FALLBACK_LOCATIONS: Location[] = [
  { label: 'VIT Chennai', lat: 12.8406, lng: 80.1534 },
  { label: 'Chennai Airport', lat: 12.9941, lng: 80.1709 },
  { label: 'Guindy', lat: 13.0067, lng: 80.2206 },
  { label: 'T Nagar', lat: 13.0418, lng: 80.2341 },
];

export const api={
  locations: async () => {
    try {
      return await json<{locations:Location[]}>('/api/v1/locations');
    } catch {
      return { locations: FALLBACK_LOCATIONS };
    }
  },
  scenarios:()=>json<{scenarios:Scenario[]}>('/api/v1/scenarios'),
  scenarioRun:(id:string)=>post<Journey>(`/api/v1/scenarios/${id}/run`,{}),
  createJourney:(pickup:Location,dropoff:Location,policy:RecoveryPolicy,needBy:string)=>post<Journey>('/api/v1/journeys',{pickup,dropoff,policy,need_by:needBy}),
  parseIntent:(text:string)=>post<{pickup:string|null;dropoff:string|null;need_in_minutes:number|null;source:string;requires_confirmation:boolean}>('/api/v1/intent/parse',{text}),
  driverMessage:(id:string,text:string)=>post<Journey>(`/api/v1/journeys/${id}/driver-message`,{text,idempotency_key:crypto.randomUUID()}),
  journey: async (id:string): Promise<Journey> => {
    try {
      return await json<Journey>(`/api/v1/journeys/${id}`);
    } catch (err) {
      if (typeof window !== 'undefined') {
        const stored = sessionStorage.getItem(`journey_${id}`) || sessionStorage.getItem('last_simulated_journey');
        if (stored) {
          try {
            return JSON.parse(stored) as Journey;
          } catch {}
        }
      }
      throw err;
    }
  },
  events:(id:string,sinceSeq=0)=>json<{events:Event[];last_event_seq:number}>(`/api/v1/journeys/${id}/events?since_seq=${sinceSeq}`),
  book: async (id:string,quoteId:string): Promise<Journey> => {
    try {
      return await post<Journey>(`/api/v1/journeys/${id}/book`,{quote_id:quoteId,idempotency_key:crypto.randomUUID()});
    } catch (err) {
      if (typeof window !== 'undefined') {
        const stored = sessionStorage.getItem(`journey_${id}`) || sessionStorage.getItem('last_simulated_journey');
        if (stored) {
          try {
            const j = JSON.parse(stored) as Journey;
            const quote = j.quotes.find(q => q.quote_id === quoteId) || j.quotes[0];
            j.active_ride_id = quoteId;
            j.state = 'BOOKED';
            j.active_ride = {
              ride_id: `ride_${quoteId}`,
              journey_id: id,
              provider: quote.provider,
              quote_id: quoteId,
              state: 'DRIVER_ASSIGNED',
              booked_at: new Date().toISOString(),
              driver_id: 'DRV_SIM_01',
              distance_to_pickup_m: 850,
              eta_sec: quote.pickup_eta_sec,
              last_position_at: new Date().toISOString(),
              is_simulated: true,
            };
            sessionStorage.setItem(`journey_${id}`, JSON.stringify(j));
            sessionStorage.setItem('last_simulated_journey', JSON.stringify(j));
            return j;
          } catch {}
        }
      }
      throw err;
    }
  },
  tick:(id:string,steps=6)=>post<Journey>(`/api/v1/journeys/${id}/tick`,{steps}),
  approve:(id:string,approved:boolean,version:number)=>post<Journey>(`/api/v1/journeys/${id}/rescue/approve`,{approved,expected_version:version,idempotency_key:crypto.randomUUID()}),
  cancel:(id:string)=>post<Journey>(`/api/v1/journeys/${id}/cancel`,{idempotency_key:crypto.randomUUID()}),
  confirmPickup:(id:string)=>post<Journey>(`/api/v1/journeys/${id}/pickup/confirm`,{idempotency_key:crypto.randomUUID()})
};
