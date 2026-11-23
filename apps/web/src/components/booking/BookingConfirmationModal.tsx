'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  ShieldCheck,
  ArrowRight,
  Car,
  MapPin,
  AlertTriangle,
  X,
} from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import type { Journey, Quote } from '@/types';
import { providerName } from '@/types';

export interface BookingConfirmationModalProps {
  isOpen: boolean;
  onClose?: () => void;
  journey: Journey;
  selectedQuote?: Quote | null;
  onTrackRide?: (journeyId: string) => void;
}

export function BookingConfirmationModal({
  isOpen,
  onClose,
  journey,
  selectedQuote,
  onTrackRide,
}: BookingConfirmationModalProps) {
  const router = useRouter();

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Determine quote data
  const quote =
    selectedQuote ||
    (journey.active_ride_id
      ? journey.quotes.find((q) => q.quote_id === journey.active_ride_id)
      : null) ||
    journey.quotes[0];

  const activeRide = journey.active_ride;
  const providerKey = activeRide?.provider || (quote ? quote.provider : 'PROVIDER_A');
  const providerLabel = providerName[providerKey] || providerKey;
  const driverId = activeRide?.driver_id || 'Assigned';
  const rideState = activeRide?.state ? activeRide.state.replaceAll('_', ' ') : 'DRIVER EN ROUTE';
  const fareInr = quote ? quote.estimated_fare_inr : 890;
  const etaMinutes = activeRide
    ? Math.ceil(activeRide.eta_sec / 60)
    : quote
    ? Math.max(1, Math.ceil(quote.pickup_eta_sec / 60))
    : 4;

  // Format reference ID
  const rawId = journey.id.replace(/^sim-/, '').replace(/[^a-zA-Z0-9]/g, '');
  const refCode = `RH-${rawId.slice(0, 6).toUpperCase() || '842913'}`;

  // Format deadline time
  const formatDeadline = (isoString?: string) => {
    if (!isoString) return '7:00 PM';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
      return '7:00 PM';
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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-modal-title"
      aria-describedby="confirmation-modal-desc"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#070A0F]/85 p-4 backdrop-blur-md transition-all duration-300"
    >
      <div className="relative w-full max-w-lg rounded-3xl bg-gradient-to-b from-[#0F1726] to-[#0B111D] p-6 sm:p-8 text-[#F6F8FC] border border-[#233550] shadow-[0_20px_60px_rgba(0,0,0,0.8)] my-8">
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
            DRIVER EN ROUTE
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

        {/* Booking Uncertain Warning Banner */}
        {journey.booking_uncertain && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl bg-[#FFB020]/15 border border-[#FFB020]/30 p-4 text-xs text-[#FFB020]">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-sm text-[#FFB020]">Booking Status Uncertain</div>
              <p className="mt-1 text-slate-300 leading-relaxed text-[11px] sm:text-xs">
                Booking Status Uncertain: Backend response timed out or requires verification. Do not retry automatically.
              </p>
            </div>
          </div>
        )}

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
                ₹{fareInr.toLocaleString('en-IN')}
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
                  {etaMinutes} min
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
              We monitor driver trajectory every 5 seconds. If pickup stalls or the driver cancels,
              we automatically recover your ride.
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
    </div>
  );
}

export default BookingConfirmationModal;
