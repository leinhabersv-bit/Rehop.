import { ArrowRight, Check, Circle, Zap } from 'lucide-react';
import { providerName, type Journey } from '@/types';

export default function AutomaticRecoveryDemo({
  journey, busy, error, canAdvance, canBoard, onAdvance, onBoard,
}: {
  journey: Journey;
  busy: string | null;
  error: string;
  canAdvance: boolean;
  canBoard: boolean;
  onAdvance: (steps: number) => void;
  onBoard: () => void;
}) {
  const ride = journey.active_ride;
  const cancelled = journey.last_ride?.state === 'DRIVER_CANCELLED' ? journey.last_ride : null;
  const replacement = cancelled && ride?.ride_id !== cancelled.ride_id && !journey.booking_uncertain ? ride : null;
  const original = cancelled ?? ride;
  const boarded = journey.state === 'PICKUP_CONFIRMED';
  const arrived = ride?.state === 'DRIVER_ARRIVED';
  const steps = [
    { label: 'Original ride', detail: original ? providerName[original.provider] : 'Awaiting booking', complete: !!original },
    { label: 'Driver cancellation', detail: cancelled ? 'Confirmed by the simulator' : 'Waiting for the scenario trigger', complete: !!cancelled },
    { label: 'Automatic replacement', detail: replacement ? `${providerName[replacement.provider]} booked automatically` : journey.state === 'EXHAUSTED' ? 'No replacement confirmed' : 'Checks fare and retry limits', complete: !!replacement },
  ];

  return (
    <section aria-labelledby="auto-recovery-demo" className="mb-6 rounded-3xl border border-[#b9ff45]/35 bg-gradient-to-br from-[#1c322c] via-[#152432] to-[#101a2b] p-5 sm:p-7">
      <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#d8ffa1]"><Zap size={15} aria-hidden="true" /> Automatic recovery enabled for this demo</p>
      <h2 id="auto-recovery-demo" className="text-2xl font-black tracking-tight sm:text-3xl">{boarded ? 'Replacement pickup confirmed' : replacement ? 'Replacement booked automatically' : 'Recover when the driver cancels'}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#c2d0df]">
        {boarded ? 'The rider boarded the replacement and recovery has ended.' : replacement ? 'ReHop used the demo’s prior opt-in and confirmed a backup after the original driver cancelled.' : `This demo opts in ahead of time. After the driver cancels, ReHop can book a fresh backup within the ₹${journey.policy.max_total_fare_inr} fare cap and ${journey.policy.max_recovery_attempts}-attempt limit.`}
      </p>
      <ol aria-label="Automatic recovery progress" className="my-4 grid gap-2.5 sm:grid-cols-3">
        {steps.map(({ label, detail, complete }) => (
          <li key={label} className="flex min-w-0 items-start gap-2.5 rounded-xl border border-[#4a5d69] bg-[#101a27] px-3 py-2.5">
            {complete ? <Check size={17} className="mt-0.5 shrink-0 text-[#B9FF45]" aria-hidden="true" /> : <Circle size={15} className="mt-0.5 shrink-0 text-[#8fa2b7]" aria-hidden="true" />}
            <div><strong className="block text-sm">{label}</strong><p className="mt-0.5 text-xs leading-relaxed text-[#b5c6d8]">{detail}</p></div>
          </li>
        ))}
      </ol>
      {busy && <p role="status" className="mb-3 text-sm text-[#dbeaff]">{busy}</p>}
      {error && <p role="alert" className="mb-3 text-sm text-[#ffb6bc]">{error}</p>}
      {!boarded && (ride?.state === 'DRIVER_EN_ROUTE' || arrived) && (
        <button type="button" disabled={!canAdvance && !canBoard} onClick={arrived ? onBoard : () => onAdvance(replacement ? 24 : 8)} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#B9FF45] px-5 text-sm font-extrabold text-[#0a121a] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B9FF45] sm:w-auto">
          {arrived ? 'Confirm boarding' : replacement ? 'Advance replacement pickup' : 'Simulate driver cancellation'} <ArrowRight size={17} aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
