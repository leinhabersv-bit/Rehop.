'use client';

import React, { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui';
import { api } from '@/lib/api/client';
import { DEFAULT_PICKUP_WAIT } from '@/lib/pickup';
import type { Location, RecoveryPolicy } from '@/types';
import { LocationInput } from './LocationInput';
import { TripRoute } from './TripRoute';
import { AiRequestInput, type ParsedIntentResult } from './AiRequestInput';
import { IntentReviewCard } from './IntentReviewCard';

export interface BookingFormProps {
  initialPickup?: string | Location;
  initialDropoff?: string | Location;
  initialMaxFare?: number;
  initialAutoRebook?: boolean;
  className?: string;
}

export const SIMULATED_BASE_TIME = '2026-11-23T08:30:00Z';

export function calculateNeedBy(needInMinutes: number, baseTime: string = SIMULATED_BASE_TIME): string {
  const simulatedBase = Date.parse(baseTime);
  return new Date(simulatedBase + needInMinutes * 60000).toISOString();
}

const PICKUP_POLICY: Omit<RecoveryPolicy, 'auto_rebook_on_confirmed_driver_cancel' | 'max_total_fare_inr'> = {
  max_recovery_attempts: 2,
  preemptive_switch_requires_approval: true,
  allow_same_provider_retry: true,
  max_cancellation_fee_inr: 100,
};

export function BookingForm({
  initialPickup = 'VIT Chennai',
  initialDropoff = 'Chennai Airport',
  initialMaxFare = 650,
  initialAutoRebook = false,
  className = '',
}: BookingFormProps) {
  const router = useRouter();
  const submitting = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const [navigating, startTransition] = useTransition();

  // Locations query from backend
  const { data: locationData, isLoading: loadingLocations, isError: locationError, refetch: reloadLocations } = useQuery({
    queryKey: ['locations'],
    queryFn: api.locations,
    staleTime: 60000,
    retry: 1,
  });

  const availableLocations: Location[] = locationData?.locations ?? [];

  // Form states
  const [pickup, setPickup] = useState(typeof initialPickup === 'string' ? initialPickup : initialPickup.label);
  const [dropoff, setDropoff] = useState(typeof initialDropoff === 'string' ? initialDropoff : initialDropoff.label);
  const [selectedPickup, setSelectedPickup] = useState(typeof initialPickup === 'string' ? null : initialPickup);
  const [selectedDropoff, setSelectedDropoff] = useState(typeof initialDropoff === 'string' ? null : initialDropoff);
  const [maxFare, setMaxFare] = useState(String(initialMaxFare));
  const [autoRebook, setAutoRebook] = useState(initialAutoRebook);
  // AI parsed intent state
  const [parsedIntent, setParsedIntent] = useState<ParsedIntentResult | null>(null);

  // Submission states
  const [busy, setBusy] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Handle AI parsing event
  const handleIntentParsed = (result: ParsedIntentResult) => {
    setParsedIntent(result);
  };

  const handleIntentConfirmed = (confirmed: {
    pickup: string;
    dropoff: string;
  }) => {
    setPickup(confirmed.pickup);
    setDropoff(confirmed.dropoff);
    setSelectedPickup(null);
    setSelectedDropoff(null);
    setParsedIntent(null);
    form.current?.focus();
  };

  const resolveLocation = (label: string) => availableLocations.find(
    (location) => location.label.toLowerCase() === label.trim().toLowerCase(),
  );
  const fromLoc = selectedPickup ?? resolveLocation(pickup);
  const toLoc = selectedDropoff ?? resolveLocation(dropoff);
  const sameLocation = fromLoc && toLoc && (
    fromLoc.label.trim().toLowerCase() === toLoc.label.trim().toLowerCase() ||
    (fromLoc.lat === toLoc.lat && fromLoc.lng === toLoc.lng)
  );

  const executeSubmission = async () => {
    if (submitting.current || navigating) return;
    setValidationError(null);
    const actualPickup = pickup;
    const actualDropoff = dropoff;

    // Validation
    if (!actualPickup.trim()) {
      setValidationError('Please specify a pickup location.');
      return;
    }
    if (!actualDropoff.trim()) {
      setValidationError('Please specify a destination.');
      return;
    }
    if (sameLocation) {
      setValidationError('Pickup and destination must be different locations.');
      return;
    }
    if (!fromLoc || !toLoc) {
      setValidationError('Search for your pickup and destination, then choose a result for each.');
      return;
    }
    submitting.current = true;
    setBusy(true);

    try {
      const policy = {
        ...PICKUP_POLICY,
        max_total_fare_inr: Number(maxFare),
        auto_rebook_on_confirmed_driver_cancel: autoRebook,
      };
      const journey = await api.createJourney(fromLoc, toLoc, policy, calculateNeedBy(DEFAULT_PICKUP_WAIT));
      startTransition(() => {
        router.push(`/compare?journey=${journey.id}`);
      });
    } catch (err) {
      setValidationError(
        `Couldn’t find rides. ${err instanceof Error ? err.message : 'Please try again.'}`
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSubmission();
  };

  return (
    <div className={`mx-auto flex w-full max-w-3xl flex-col gap-4 max-sm:gap-3 ${className}`}>
      <details className="rounded-2xl border border-[#dedce9] bg-[#f0edff] px-4 py-3 text-[#382b70] max-sm:px-3 max-sm:py-0 max-sm:open:pb-3">
        <summary className="cursor-pointer rounded-md py-1 text-sm font-bold max-sm:min-h-11 max-sm:py-3">Describe your trip with AI</summary>
        <div className="mt-3"><AiRequestInput onIntentParsed={handleIntentParsed} /></div>
      </details>

      {parsedIntent && (
        <IntentReviewCard
          key={parsedIntent.original_text}
          locations={availableLocations}
          intent={parsedIntent}
          onConfirmAndFind={handleIntentConfirmed}
          onEditManually={() => setParsedIntent(null)}
        />
      )}

      <form ref={form} tabIndex={-1} onSubmit={handleSubmit} className="ride-planner grid min-w-0 gap-3 rounded-[26px] border border-[#e0dceb] bg-[#fffdf8] p-3 max-sm:rounded-3xl max-sm:shadow-[0_8px_24px_#171b370a] sm:gap-4 sm:p-6">
        <section aria-labelledby="trip-route" className="grid min-w-0 gap-2">
          <h2 id="trip-route" className="text-lg font-extrabold">Trip route</h2>
          {loadingLocations && <p role="status" className="text-sm text-[#475673]">Loading pickup points…</p>}
          {locationError && <p role="alert" className="text-sm text-[#a42644]">Pickup points unavailable. <button type="button" className="underline" onClick={() => void reloadLocations()}>Try again</button></p>}
          <LocationInput
            pickup={pickup}
            dropoff={dropoff}
            onPickupChange={(value) => { setPickup(value); setSelectedPickup(null); }}
            onDropoffChange={(value) => { setDropoff(value); setSelectedDropoff(null); }}
            onPickupSelect={(place) => { setPickup(place.label); setSelectedPickup(place); }}
            onDropoffSelect={(place) => { setDropoff(place.label); setSelectedDropoff(place); }}
            onSwap={() => {
              setPickup(dropoff);
              setDropoff(pickup);
              setSelectedPickup(selectedDropoff);
              setSelectedDropoff(selectedPickup);
            }}
            availableLocations={availableLocations}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#d9dbe7] bg-[#f4f6ff] p-3">
            <div>
              <label htmlFor="max-fare" className="block text-sm font-extrabold text-[#171b37]">Max fare (₹)</label>
              <p id="max-fare-detail" className="text-xs text-[#475673]">Applies to your ride and any replacement.</p>
            </div>
            <input id="max-fare" type="number" inputMode="numeric" min={1} max={100000} step={1} required
              aria-describedby="max-fare-detail" value={maxFare} onChange={(event) => setMaxFare(event.target.value)}
              className="min-h-11 w-28 rounded-xl border border-[#a5b4d4] bg-white px-3 text-base font-bold text-[#171b37] focus-visible:outline-2 focus-visible:outline-[#173ed7]" />
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[#dedce9] bg-[#f0edff] p-3 text-[#382b70]">
            <input type="checkbox" role="switch" checked={autoRebook} onChange={(event) => setAutoRebook(event.target.checked)}
              className="size-5 shrink-0 accent-[#563580]" aria-describedby="auto-rebook-detail" />
            <span>
              <span className="block text-sm font-bold">Auto-rebook if my driver cancels</span>
              <span id="auto-rebook-detail" className="block text-xs leading-relaxed">If an eligible backup is available, RIDE &amp; SEEK books it and continues tracking. A delayed pickup still needs your approval to switch.</span>
            </span>
          </label>
          {fromLoc && toLoc && !sameLocation && <TripRoute pickup={fromLoc} dropoff={toLoc} />}
        </section>

        <div className="sticky bottom-0 z-20 -mx-1 rounded-2xl border border-[#d9dbe7] bg-[#fff9f0]/95 p-2 pb-[max(.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_#171b3710] backdrop-blur max-sm:static max-sm:mx-0 max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none max-sm:backdrop-blur-none sm:shadow-none">
          {validationError && <p role="alert" className="mb-2 px-2 text-sm font-semibold text-[#a42644]">{validationError}</p>}
          <Button type="submit" fullWidth size="lg" disabled={!locationData || !!parsedIntent || navigating} loading={busy || navigating} loadingText="Finding rides…" rightIcon={<ArrowRight size={18} aria-hidden="true" />}>
            Find my ride
          </Button>
        </div>
      </form>
    </div>
  );
}

export default BookingForm;
