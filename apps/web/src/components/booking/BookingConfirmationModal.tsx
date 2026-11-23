'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Car, Check, MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { providerName, type Journey } from '@/types';

export interface BookingConfirmationModalProps {
  isOpen: boolean;
  onClose?: () => void;
  journey: Journey;
  onTrackRide?: (journeyId: string) => void;
}

export function hasConfirmedRide(journey: Journey, quoteId?: string): boolean {
  const ride = journey.active_ride;
  return journey.booking_uncertain === false &&
    ['MONITORING', 'AT_RISK', 'AWAITING_APPROVAL', 'PICKUP_CONFIRMED'].includes(journey.state) &&
    !!ride && ride.journey_id === journey.id && ride.ride_id === journey.active_ride_id &&
    (quoteId === undefined || ride.quote_id === quoteId) &&
    ['CONFIRMED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'IN_PROGRESS'].includes(ride.state);
}

const simulatorTime = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
});

export function BookingConfirmationModal({ isOpen, onClose, journey, onTrackRide }: BookingConfirmationModalProps) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const ride = hasConfirmedRide(journey) ? journey.active_ride : null;
  const rideId = ride?.ride_id;

  useEffect(() => {
    const node = dialog.current;
    if (!node || !isOpen || !rideId) return;
    node.showModal();
    return () => node.close();
  }, [isOpen, rideId]);

  if (!isOpen || !ride) return null;

  const quote = journey.quotes.find((item) =>
    item.quote_id === ride.quote_id && item.provider === ride.provider);
  const deadline = Date.parse(journey.need_by);
  const rideState = {
    CONFIRMED: 'Booking accepted',
    DRIVER_EN_ROUTE: 'Driver approaching',
    DRIVER_ARRIVED: 'Driver at pickup',
    IN_PROGRESS: 'Passenger boarded',
  }[ride.state] ?? 'Status unavailable';

  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      aria-labelledby="confirmation-modal-title"
      aria-describedby="confirmation-modal-desc"
      className="fixed inset-x-0 bottom-0 top-auto m-0 w-full max-w-none overflow-hidden rounded-t-3xl border border-[#d9dbe7] bg-[#edf1ff] p-0 text-[#171b37] shadow-2xl backdrop:bg-[#171b37]/45 backdrop:backdrop-blur-md sm:inset-0 sm:m-auto sm:w-[calc(100%-2rem)] sm:max-w-lg sm:rounded-3xl"
    >
      <div className="flex max-h-[calc(100dvh-1rem)] flex-col sm:max-h-[calc(100dvh-2rem-2px)]">
        <div className="flex shrink-0 items-center justify-between border-b border-[#d9dbe7] px-4 py-2 sm:px-7 sm:py-3">
          <span className="text-xs font-bold uppercase tracking-wider text-[#475673]">Simulated ride</span>
          <button
            type="button"
            onClick={onClose ?? (() => dialog.current?.close())}
            aria-label="Close dialog"
            className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-[#e4eaff]/60 text-[#475673] hover:text-[#171b37] focus-visible:outline focus-visible:outline-[#B9FF45]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-7 sm:py-6">
          <div className="text-center">
            <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-[#173ed7] text-white shadow-[0_0_32px_rgba(39,59,119,0.12)] sm:size-14">
              <Check className="h-7 w-7" aria-hidden="true" strokeWidth={3} />
            </span>
            <h2 id="confirmation-modal-title" className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
              Booking confirmed<span className="text-[#173ed7]">.</span>
            </h2>
            <p id="confirmation-modal-desc" className="mt-2 text-sm text-[#475673]">
              Confirm boarding after your driver reaches the pickup point.
            </p>
          </div>

          <div className="mt-4 space-y-3 rounded-2xl border border-[#d9dbe7] bg-[#fffdf8] p-3 sm:mt-5 sm:space-y-4 sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#edf1ff] text-[#173ed7] sm:flex">
                  <Car className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="font-bold">{providerName[ride.provider]}</p>
                  <p className="break-all text-xs text-[#475673]">Driver {ride.driver_id}</p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xl font-black">
                  {quote ? '₹' + quote.estimated_fare_inr.toLocaleString('en-IN') : '—'}
                </p>
                <p className="text-xs text-[#475673]">Estimated fare</p>
              </div>
            </div>

            <p className="flex items-start gap-2 border-t border-[#d9dbe7] pt-3 text-sm">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#173ed7]" aria-hidden="true" />
              <span className="min-w-0 break-words">{journey.pickup.label} → {journey.dropoff.label}</span>
            </p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:flex sm:flex-wrap sm:gap-x-5 sm:gap-y-3">
              <div>
                <dt className="text-xs text-[#475673]">Driver to pickup (simulated)</dt>
                <dd className="font-bold">{Math.ceil(ride.eta_sec / 60)} min</dd>
              </div>
              <div>
                <dt className="text-xs text-[#475673]">Pickup deadline</dt>
                <dd className="font-bold">{Number.isFinite(deadline) ? simulatorTime.format(deadline) + ' UTC' : '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#475673]">Driver status</dt>
                <dd className="font-bold text-[#0d755d]">{rideState}</dd>
              </div>
            </dl>
            <p className="break-all border-t border-[#d9dbe7] pt-3 text-xs text-[#475673]">
              Ride ID <span className="font-mono text-[#171b37]">{ride.ride_id}</span>
            </p>
          </div>
        </div>

        <div className="shrink-0 border-t border-[#d9dbe7] px-4 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-7 sm:py-4">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => onTrackRide ? onTrackRide(journey.id) : router.push('/journey/' + journey.id)}
            rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
          >
            Track your ride
          </Button>
        </div>
      </div>
    </dialog>
  );
}

export default BookingConfirmationModal;
