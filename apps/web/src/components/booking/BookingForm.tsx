'use client';

import React, { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Clock3, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui';
import { api } from '@/lib/api/client';
import { DEFAULT_PICKUP_WAIT, PICKUP_WAIT_PRESETS } from '@/lib/pickup';
import type { Location, RecoveryPolicy } from '@/types';
import { LocationInput } from './LocationInput';
import { TripRoute } from './TripRoute';
import { AiRequestInput, type ParsedIntentResult } from './AiRequestInput';
import { IntentReviewCard } from './IntentReviewCard';

export interface BookingFormProps {
  initialPickup?: string;
  initialDropoff?: string;
  initialNeedIn?: number;
  className?: string;
}

export const SIMULATED_BASE_TIME = '2026-11-23T08:30:00Z';

export function calculateNeedBy(needInMinutes: number, baseTime: string = SIMULATED_BASE_TIME): string {
  const simulatedBase = Date.parse(baseTime);
  return new Date(simulatedBase + needInMinutes * 60000).toISOString();
}

const BUDGET_PRESETS = [350, 500, 650, 900, 1200];

export function BookingForm({
  initialPickup = 'VIT Chennai',
  initialDropoff = 'Chennai Airport',
  initialNeedIn = DEFAULT_PICKUP_WAIT,
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
  const [pickup, setPickup] = useState(initialPickup);
  const [dropoff, setDropoff] = useState(initialDropoff);
  const [selectedPickup, setSelectedPickup] = useState<Location | null>(null);
  const [selectedDropoff, setSelectedDropoff] = useState<Location | null>(null);
  const [budget, setBudget] = useState(650);
  const [needInMinutes, setNeedInMinutes] = useState(initialNeedIn);

  // Safety limits states
  const [maxAttempts, setAttempts] = useState(2);
  const [maxFee, setMaxFee] = useState(100);

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
    need_in_minutes: number | null;
    budget: number | null;
  }) => {
    setPickup(confirmed.pickup);
    setDropoff(confirmed.dropoff);
    setSelectedPickup(null);
    setSelectedDropoff(null);
    if (confirmed.need_in_minutes !== null) setNeedInMinutes(confirmed.need_in_minutes);
    if (confirmed.budget !== null) setBudget(confirmed.budget);
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
    const actualNeedIn = needInMinutes;
    const actualBudget = budget;

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
    if (!actualBudget || actualBudget < 100 || actualBudget > 10000) {
      setValidationError('Maximum budget must be between ₹100 and ₹10,000.');
      return;
    }

    if (!fromLoc || !toLoc) {
      setValidationError('Search for your pickup and destination, then choose a result for each.');
      return;
    }
    if (!Number.isInteger(actualNeedIn) || actualNeedIn < 5 || actualNeedIn > 120) {
      setValidationError('Choose a pickup deadline between 5 and 120 minutes.');
      return;
    }
    submitting.current = true;
    setBusy(true);

    const policy: RecoveryPolicy = {
      auto_rebook_on_confirmed_driver_cancel: true,
      max_total_fare_inr: actualBudget,
      max_recovery_attempts: maxAttempts,
      preemptive_switch_requires_approval: true,
      allow_same_provider_retry: true,
      max_cancellation_fee_inr: maxFee,
    };

    // Need_by simulation timestamp (UTC ISO format)
    const needByIso = calculateNeedBy(actualNeedIn);

    try {
      // 1. Try real backend API
      const journey = await api.createJourney(fromLoc, toLoc, policy, needByIso);
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
    <div className={`mx-auto flex w-full max-w-3xl flex-col gap-4 ${className}`}>
      <details className="rounded-2xl border border-[#dedce9] bg-[#f0edff] px-4 py-3 text-[#382b70]">
        <summary className="cursor-pointer rounded-md py-1 text-sm font-bold">Describe your trip with AI</summary>
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

      <form ref={form} tabIndex={-1} onSubmit={handleSubmit} className="grid gap-4 rounded-[26px] border border-[#e0dceb] bg-[#fffdf8] p-4 sm:p-6">
        <section aria-labelledby="trip-route" className="grid gap-2">
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
          {fromLoc && toLoc && !sameLocation && <TripRoute pickup={fromLoc} dropoff={toLoc} collapsed />}
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <section className="rounded-2xl border border-[#dce1ed] bg-[#f2f5ff] p-4">
            <label htmlFor="pickup-deadline" className="!flex items-center justify-between !text-[#171b37]">
              <span className="inline-flex items-center gap-2"><Clock3 size={16} className="text-[#173ed7]" aria-hidden="true" /> Maximum pickup wait</span>
              <strong>{needInMinutes} min</strong>
            </label>
            <div className="my-3 flex flex-wrap gap-1.5">
              {PICKUP_WAIT_PRESETS.map((preset) => <button key={preset} type="button" onClick={() => setNeedInMinutes(preset)} aria-pressed={needInMinutes === preset} className={`min-h-8 rounded-lg px-2.5 text-xs font-bold ${needInMinutes === preset ? 'bg-[#173ed7] text-white' : 'bg-white text-[#354366]'}`}>{preset} min</button>)}
            </div>
            <input id="pickup-deadline" type="range" min={5} max={120} step={1} value={needInMinutes} onChange={(event) => setNeedInMinutes(Number(event.target.value))} className="!m-0 accent-[#173ed7]" />
          </section>
          <section className="rounded-2xl border border-[#e9daca] bg-[#fff2e6] p-4">
            <label htmlFor="max-fare" className="!text-[#171b37]">Fare cap (₹)</label>
            <input id="max-fare" value={budget || ''} onChange={(event) => setBudget(Number(event.target.value))} type="number" min={100} max={10000} required className="!mt-2 !bg-white" />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {BUDGET_PRESETS.map((preset) => <button key={preset} type="button" onClick={() => setBudget(preset)} aria-pressed={budget === preset} className={`min-h-8 rounded-lg px-2.5 text-xs font-bold ${budget === preset ? 'bg-[#ffbc90] text-[#3f261f]' : 'bg-white text-[#594333]'}`}>₹{preset}</button>)}
            </div>
          </section>
        </div>

        <section aria-labelledby="pickup-protection" className="rounded-2xl border border-[#dce1ed] p-4">
          <h2 id="pickup-protection" className="mb-2 flex items-center gap-2 text-base font-extrabold"><ShieldCheck size={19} className="text-[#173ed7]" aria-hidden="true" /> Pickup protection</h2>
          <p className="text-sm text-[#475673]">Driver stalled? You approve any switch. Driver cancelled? We rebook automatically within your fare and retry limits.</p>
          <details className="mt-3 border-t border-[#e2e6ef] pt-2">
            <summary className="cursor-pointer py-1 text-sm font-bold text-[#173ed7]">Recovery limits</summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label>Maximum recovery attempts
                <select id="attempt-cap" value={maxAttempts} onChange={(event) => setAttempts(Number(event.target.value))}>
                  {[0, 1, 2, 3].map((attempt) => <option key={attempt} value={attempt}>{attempt}</option>)}
                </select>
              </label>
              <label>Maximum cancellation fee
                <select id="fee-cap" value={maxFee} onChange={(event) => setMaxFee(Number(event.target.value))}>
                  {[0, 50, 100].map((fee) => <option key={fee} value={fee}>₹{fee}</option>)}
                </select>
              </label>
            </div>
          </details>
        </section>

        <div className="sticky bottom-0 z-20 -mx-1 rounded-2xl border border-[#d9dbe7] bg-[#fff9f0]/95 p-2 backdrop-blur">
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
