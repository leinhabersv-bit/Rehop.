'use client';

import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  ShieldCheck,
  ArrowRight,
  Car,
  MapPin,
  X,
} from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import type { Journey } from '@/types';
import { providerName } from '@/types';

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

export function BookingConfirmationModal({
  isOpen,
  onClose,
  journey,
  onTrackRide,
}: BookingConfirmationModalProps) {
  const router = useRouter();

  const dialog = useRef<HTMLDialogElement>(null);
  const activeRide = hasConfirmedRide(journey) ? journey.active_ride : null;
  useEffect(() => {
    const node = dialog.current;
    if (!node || !isOpen) return;
    node.showModal();
    return () => node.close();
  }, [isOpen, activeRide]);

  if (!isOpen || !activeRide) return null;
  const quote = journey.quotes.find((item) =>
    item.quote_id === activeRide.quote_id && item.provider === activeRide.provider);
  const providerLabel = providerName[activeRide.provider];
  const driverId = activeRide.driver_id;
  const rideState = activeRide.state.replaceAll('_', ' ');
  const fareInr = quote?.estimated_fare_inr ?? null;
  const etaMinutes = Math.ceil(activeRide.eta_sec / 60);

  // Format reference ID
  const rawId = journey.id.replace(/^sim-/, '').replace(/[^a-zA-Z0-9]/g, '');
  const refCode = rawId ? `RH-${rawId.slice(0, 6).toUpperCase()}` : `RH-${journey.id.slice(0, 6).toUpperCase()}`;

  // Format deadline time
  const formatDeadline = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
      return '—';
    }
  };

  const handleTrackRide = () => {
    if (onTrackRide) {
      onTrackRide(journey.id);
    } else {
      router.push(`/journey/${journey.id}`);
    }
  };

  const handleBackHome = () => {
    if (onClose) {
      onClose();
    }
    router.push('/book');
  };

  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      aria-labelledby="confirmation-modal-title"
      aria-describedby="confirmation-modal-desc"
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl bg-transparent p-0 backdrop:bg-[#070A0F]/85 backdrop:backdrop-blur-md"
    >
      <div className="relative w-full max-w-lg rounded-3xl bg-gradient-to-b from-[#0F1726] to-[#0B111D] p-6 sm:p-8 text-[#F6F8FC] border border-[#233550] shadow-[0_20px_60px_rgba(0,0,0,0.8)] ">
        {/* Top Header / Bar */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <button
            type="button"
            onClick={onClose || handleBackHome}
            aria-label="Close dialog"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800/60 border border-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#132D21] px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-[#B9FF45] border border-[#1F4A35]">
            <Check className="h-3 w-3 stroke-[3]" />
            BOOKING CONFIRMED
          </span>
        </div>

        {/* Hero Graphic & Heading */}
        <div className="text-center mt-6">
          <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#B9FF45] shadow-[0_0_60px_rgba(185,255,69,0.3)]">
            <Check className="h-10 w-10 text-[#090F1D] stroke-[3.5]" />
          </div>

          <div className="mt-4 text-[11px] font-black uppercase tracking-widest text-[#B9FF45]">
            {rideState}
          </div>

          <h2
            id="confirmation-modal-title"
            className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-white"
          >
            Booking Confirmed<span className="text-[#B9FF45]">.</span>
          </h2>

          <p
            id="confirmation-modal-desc"
            className="mx-auto mt-2 max-w-sm text-xs sm:text-sm text-[#98A5BC] leading-relaxed"
          >
            Success means pickup confirmed after boarding. ReHop is now monitoring driver telemetry.
          </p>
        </div>

        {/* Card 1: Confirmed Details Card */}
        <div className="mt-6 rounded-2xl bg-[#0E1624] border border-slate-800 p-4 sm:p-5 space-y-4">
          {/* Row 1: Booking Reference & Status */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-slate-400">Booking reference</div>
              <div className="text-base sm:text-lg font-extrabold text-white tracking-wide mt-0.5">
                {refCode}
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0C2A20] px-3 py-1 text-xs font-semibold text-[#2ED389] border border-[#1B5037]">
              <Check className="h-3 w-3 stroke-[3]" />
              Confirmed
            </span>
          </div>

          <div className="border-t border-slate-800/80" />

          {/* Row 2: Selected Provider & Driver Details */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#132D21] text-[#B9FF45] border border-[#1F4A35]">
                <Car className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm sm:text-base">
                    {providerLabel}
                  </span>
                  <Badge variant="simulation" size="sm">
                    Simulated
                  </Badge>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Driver: <strong className="text-slate-200">{driverId}</strong> · {rideState} (Simulated)
                </div>
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="text-xl sm:text-2xl font-black text-white">
                {fareInr !== null ? `₹${fareInr.toLocaleString('en-IN')}` : '—'}
              </div>
              <div className="text-[11px] text-slate-400">estimated fare</div>
            </div>
          </div>

          <div className="border-t border-slate-800/80" />

          {/* Row 3: Route & Metrics */}
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <MapPin className="h-3.5 w-3.5 text-[#B9FF45] shrink-0" />
              <span className="font-medium truncate">{journey.pickup.label}</span>
              <span className="text-slate-600">→</span>
              <span className="font-medium truncate">{journey.dropoff.label}</span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/60">
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-500">Pickup ETA</div>
                <div className="text-sm sm:text-base font-extrabold text-white mt-0.5">
                  {etaMinutes !== null ? `${etaMinutes} min` : '—'}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-500">Need by</div>
                <div className="text-sm sm:text-base font-extrabold text-white mt-0.5">
                  {formatDeadline(journey.need_by)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-500">State</div>
                <div className="text-xs sm:text-sm font-extrabold text-[#2ED389] mt-0.5 uppercase truncate">
                  {rideState}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: ReHop Active Protection Banner */}
        <div className="mt-3 flex items-start gap-3 rounded-2xl bg-[#0B1916] border border-[#184833] p-4 text-xs">
          <ShieldCheck className="h-5 w-5 text-[#B9FF45] shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-white text-xs sm:text-sm">
              ReHop Active Protection ON
            </div>
            <div className="text-slate-400 mt-1 leading-relaxed text-[11px] sm:text-xs">
              We monitor driver trajectory. If the driver cancels and you opted into auto-recovery,
              ReHop will seek a backup within your budget. Preemptive switches always require your approval.
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 space-y-2.5">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleTrackRide}
            rightIcon={<ArrowRight className="h-4 w-4" />}
            className="!rounded-2xl shadow-[0_0_24px_rgba(185,255,69,0.3)] hover:brightness-105"
          >
            Track your ride
          </Button>

          <button
            type="button"
            onClick={handleBackHome}
            className="w-full text-center text-xs font-semibold text-slate-400 hover:text-white transition-colors py-2"
          >
            Back to Home
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default BookingConfirmationModal;
