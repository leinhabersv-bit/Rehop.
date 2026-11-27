import Link from 'next/link';
import { ArrowRight, Bell, CarFront, CheckCircle2, MapPin } from 'lucide-react';
import type { Journey } from '@/types';

export function RideUpdate({ ride, receiptId }: { ride?: Journey; receiptId?: string }) {
  const id = ride?.id ?? receiptId;
  if (!id) return null;

  const uncertain = ride?.booking_uncertain || ride?.state === 'RECONCILING';
  const atPickup = !uncertain && ride?.active_ride?.state === 'DRIVER_ARRIVED';
  const boarding = ride?.state === 'PICKUP_CONFIRMED';
  const approval = !uncertain && ride?.state === 'AWAITING_APPROVAL';
  const replacement = approval && !ride?.active_ride && ride?.last_ride?.state === 'DRIVER_CANCELLED';
  const title = !ride ? 'Trip completed' : atPickup ? 'Your driver has arrived' :
    boarding ? 'You’re on your way' : replacement ? 'Your driver cancelled' : approval ? 'A backup ride needs your review' :
    uncertain ? 'Checking whether your booking went through…' : 'Your ride is on the way';
  const detail = !ride ? 'Your trip receipt is ready.' : atPickup ? 'Confirm boarding when you’re in the car.' :
    replacement ? 'Review the replacement to continue. Auto-rebooking is off.' :
    approval ? 'Open tracking to review the backup and any cancellation fee.' : uncertain ? 'Open tracking for the latest provider status.' :
    boarding ? `Heading to ${ride.dropoff.label}.` : `Pickup at ${ride.pickup.label}.`;
  const Icon = !ride ? CheckCircle2 : atPickup ? MapPin : approval || uncertain ? Bell : CarFront;
  const href = `/journey/${encodeURIComponent(id)}${atPickup ? '#confirm-boarding' : replacement ? '#review-replacement' : ''}`;
  const action = !ride ? 'View trip receipt' : atPickup ? 'Confirm boarding' : replacement ? 'Review replacement' : approval ? 'Review backup' : 'Track ride';

  return (
    <section aria-label="Ride update" className="sticky top-14 z-30 flex flex-wrap items-center gap-3 rounded-2xl border border-[#d9dbe7] bg-[#fffdf8] p-3 shadow-md sm:top-16 sm:px-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#ffdec8] text-[#111a42]">
        <Icon size={21} aria-hidden="true" />
      </span>
      <div role="status" aria-live="polite" aria-atomic="true" className="min-w-0 flex-1 break-words">
        <p key={title} className="ride-stage font-black text-[#111a42]">{title}</p>
        <p className="text-sm text-[#43536b]">{detail}</p>
      </div>
      <Link className="btn gap-2 max-sm:w-full" href={href}>{action}<ArrowRight size={17} aria-hidden="true" /></Link>
    </section>
  );
}
