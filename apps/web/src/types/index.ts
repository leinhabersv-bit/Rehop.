export type Provider = 'PROVIDER_A'|'PROVIDER_C'|'PROVIDER_B'|'PROVIDER_D';
export type Location = { label:string;lat:number;lng:number };
export type RecoveryPolicy = {
  auto_rebook_on_confirmed_driver_cancel:boolean;max_total_fare_inr:number;
  max_recovery_attempts:number;preemptive_switch_requires_approval:true;
  allow_same_provider_retry:boolean;max_cancellation_fee_inr:number
};
export type Quote = { quote_id:string;provider:Provider;estimated_fare_inr:number;pickup_eta_sec:number;expires_at:string;is_simulated:true };
export type Risk = { score_0_100:number;band:'LOW'|'MEDIUM'|'HIGH'|'UNKNOWN';
  confidence:number;signals:string[];explanation:string;model_version:string;is_simulated:true;
  explanation_source?:'llm_verified'|'deterministic_template'|null };
export type Ride = {ride_id:string;journey_id:string;provider:Provider;quote_id:string;
  state:string;booked_at:string;driver_id:string;distance_to_pickup_m:number;
  eta_sec:number;last_position_at:string;is_simulated:true};
export type Event = {event_id:string;journey_id:string;seq:number;timestamp:string;type:string;
  ride_id:string|null;payload:Record<string,unknown>};
export type Journey = {id:string;pickup:Location;dropoff:Location;state:string;version:number;
  active_ride_id:string|null;active_ride:Ride|null;last_ride:Ride|null;quotes:Quote[];
  risk:Risk|null;pending_backup:Quote|null;recovery_attempts:number;
  policy:RecoveryPolicy;scenario:string;simulated_time:string;is_simulated:true;
  booking_uncertain:boolean;last_event_seq:number;need_by:string;boarded_at?:string|null;arrives_at?:string|null;
  driver_chat_signal:{label:string;evidence:string;source:string}|null;
  deadline_decision:{seconds_until_deadline:number;wait_cost_points:number;switch_cost_points:number;recommendation:string}|null;
  cancellation_fee_notice:{potential_fee_upper_bound_inr:number;actual_fee_inr:number|null;fee_confirmed:boolean;caution:string}|null};
export type Scenario = {id:string;name:string};
export const providerName:Record<Provider,string>={PROVIDER_A:'Provider A',PROVIDER_B:'Provider B',PROVIDER_C:'Provider C',PROVIDER_D:'Provider D'};
