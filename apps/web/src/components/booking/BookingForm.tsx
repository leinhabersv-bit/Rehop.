'use client';

import React, { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldCheck,
  Clock,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { api, API_BASE } from '@/lib/api/client';
import { DEFAULT_PICKUP_WAIT, PICKUP_WAIT_PRESETS } from '@/lib/pickup';
import type { Location, RecoveryPolicy } from '@/types';
import { LocationInput } from './LocationInput';
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
  const [stalledSimulation, setStalledSimulation] = useState(false);
  const [budget, setBudget] = useState(650);
  const [needInMinutes, setNeedInMinutes] = useState(initialNeedIn);

  // Safety limits states
  const [autoRebook, setAutoRebook] = useState(false);
  const [maxAttempts, setAttempts] = useState(2);
  const [maxFee, setMaxFee] = useState(100);
  const [showAdvancedSafety, setShowAdvancedSafety] = useState(false);

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
    if (confirmed.need_in_minutes !== null) setNeedInMinutes(confirmed.need_in_minutes);
    if (confirmed.budget !== null) setBudget(confirmed.budget);
    setParsedIntent(null);
    form.current?.focus();
  };

  const resolveLocation = (label: string) => availableLocations.find(
    (location) => location.label.toLowerCase() === label.trim().toLowerCase(),
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
    if (actualPickup.trim().toLowerCase() === actualDropoff.trim().toLowerCase()) {
      setValidationError('Pickup and destination must be different locations.');
      return;
    }
    if (!actualBudget || actualBudget < 100 || actualBudget > 10000) {
      setValidationError('Maximum budget must be between ₹100 and ₹10,000.');
      return;
    }

    const fromLoc = resolveLocation(actualPickup);
    const toLoc = resolveLocation(actualDropoff);
    if (!fromLoc || !toLoc) {
      setValidationError('Choose both places from the simulator location list.');
      return;
    }
    if (!Number.isInteger(actualNeedIn) || actualNeedIn < 5 || actualNeedIn > 120) {
      setValidationError('Choose a pickup deadline between 5 and 120 minutes.');
      return;
    }
    submitting.current = true;
    setBusy(true);

    const policy: RecoveryPolicy = {
      auto_rebook_on_confirmed_driver_cancel: autoRebook,
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
      const journey = await api.createJourney(fromLoc, toLoc, policy, needByIso, stalledSimulation ? 'S03' : 'S01');
      startTransition(() => {
        router.push(`/compare?journey=${journey.id}`);
      });
    } catch (err) {
      setValidationError(
        `Failed to create journey: ${err instanceof Error ? err.message : 'Backend unreachable'}. Ensure the backend is running at ${API_BASE}.`
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
    <div className={`flex flex-col gap-4 max-w-3xl mx-auto w-full ${className}`}>
      {/* 1. AI Request Natural Language Card */}
      <details className="rounded-2xl border border-[#3f385d] bg-[#18182b] px-4 py-3 text-[#e0d4ff]">
        <summary className="cursor-pointer rounded-md py-1 text-sm font-bold focus-visible:outline-2 focus-visible:outline-[#B79CFF]">Describe your trip with AI</summary>
        <div className="mt-3"><AiRequestInput onIntentParsed={handleIntentParsed} /></div>
      </details>

      {/* 2. AI Request Review Card (Displayed if intent is parsed) */}
      {parsedIntent && (
        <IntentReviewCard
          key={parsedIntent.original_text}
          locations={availableLocations}
          intent={parsedIntent}
          onConfirmAndFind={handleIntentConfirmed}
          onEditManually={() => setParsedIntent(null)}
        />
      )}

      {/* 3. Main Booking Form */}
      <form ref={form} tabIndex={-1} onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Locations (Pickup & Destination) */}
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold">Trip route</h2>

          {loadingLocations && <p role="status" className="text-sm text-slate-400">Loading simulated locations…</p>}
          {locationError && <p role="alert" className="text-sm text-[#FF6D76]">
            Location list unavailable. <button type="button" className="underline" onClick={() => reloadLocations()}>Try again</button>
          </p>}
          <LocationInput
            pickup={pickup}
            dropoff={dropoff}
            onPickupChange={setPickup}
            onDropoffChange={setDropoff}
            availableLocations={availableLocations}
          />
        </section>

        {/* Pickup Deadline & Budget (2 Column Grid) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Pickup Deadline (need_by in simulated minutes) */}
          <Card className="!p-5 bg-[#0E1726] border-[#1E2E46]">
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="pickup-deadline" className="text-xs font-extrabold uppercase tracking-wider text-[#98A5BC] flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-[#B9FF45]" />
                Maximum pickup wait
              </label>
              <strong className="text-base text-white">{needInMinutes} min</strong>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-[#b3c2d8]">How long you can wait for the driver. Pickup estimates come from the quotes.</p>

            {/* Quick chips */}
            <div className="flex flex-wrap gap-1.5 mb-3.5">
              {PICKUP_WAIT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={needInMinutes === preset}
                  onClick={() => setNeedInMinutes(preset)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    needInMinutes === preset
                      ? 'bg-[#B9FF45] text-[#090F1D] shadow-sm'
                      : 'bg-[#151F32] text-[#98A5BC] hover:text-[#F6F8FC] border border-[#22334D]'
                  }`}
                >
                  {preset} min
                </button>
              ))}
            </div>

            {/* Range Slider */}
            <input
              id="pickup-deadline"
              type="range"
              min={5}
              max={120}
              step={1}
              value={needInMinutes}
              onChange={(e) => setNeedInMinutes(Number(e.target.value))}
              className="w-full accent-[#B9FF45] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-semibold text-[#98A5BC]/70 mt-1">
              <span>5 min</span>
              <span>120 min</span>
            </div>
          </Card>

          {/* Maximum Budget */}
          <Card className="!p-5 bg-[#0E1726] border-[#1E2E46]">
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="max-fare" className="text-xs font-extrabold uppercase tracking-wider text-[#98A5BC] flex items-center gap-1.5">
                <span className="text-[#B9FF45] font-black text-sm">₹</span>
                Maximum Fare Cap
              </label>
              <span className="text-sm font-black text-[#F6F8FC]">₹{budget}</span>
            </div>

            <p className="text-[11px] text-[#98A5BC] mb-3">
              We never auto-rebook to backup rides that exceed this budget ceiling.
            </p>

            {/* Preset chips */}
            <div className="flex flex-wrap gap-1.5 mb-3.5">
              {BUDGET_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setBudget(preset)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    budget === preset
                      ? 'bg-[#B9FF45] text-[#090F1D] shadow-sm'
                      : 'bg-[#151F32] text-[#98A5BC] hover:text-[#F6F8FC] border border-[#22334D]'
                  }`}
                >
                  ₹{preset}
                </button>
              ))}
            </div>

            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-xs font-extrabold text-[#98A5BC]">₹</span>
              <input
                id="max-fare"
                type="number"
                min={100}
                max={10000}
                step={1}
                value={budget}
                onChange={(e) => setBudget(Math.max(0, Number(e.target.value)))}
                className="w-full rounded-xl bg-[#131E31] border border-[#22334D] pl-8 pr-4 py-2 text-sm font-bold text-[#F6F8FC] focus:outline-none focus:border-[#B9FF45]"
              />
            </div>
          </Card>
        </div>

        {/* Safety Limits Section (Collapsible Accordion) */}
        <div className="rounded-2xl bg-[#0E1726] border border-[#1E2E46] overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvancedSafety(!showAdvancedSafety)}
            className="flex items-center justify-between w-full px-5 py-4 text-left transition-colors hover:bg-[#131E31]"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2ED389]/15 text-[#2ED389]">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <span className="text-xs sm:text-sm font-extrabold text-[#F6F8FC] block">
                  Safety & Autonomous Recovery Limits
                </span>
                <span className="text-[11px] text-[#98A5BC]">
                  Configures auto-rebook policies and cancellation fee guardrails
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[#98A5BC]">
              <span className="text-xs font-bold hidden sm:inline">
                {showAdvancedSafety ? 'Hide' : 'Configure'}
              </span>
              {showAdvancedSafety ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </div>
          </button>

          {showAdvancedSafety && (
            <div className="p-5 pt-1 border-t border-[#1E2E46] flex flex-col gap-4">
              {/* Auto rebook toggle */}
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoRebook}
                  onChange={(e) => setAutoRebook(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded accent-[#B9FF45] border-[#2B3E5C]"
                />
                <div>
                  <span className="text-xs sm:text-sm font-bold text-[#F6F8FC] block">
                    Automatically rebook after confirmed driver cancellation
                  </span>
                  <span className="text-[11px] text-[#98A5BC]">
                    If a driver cancels on you, ReHop immediately engages a ranked backup provider
                    within your budget without waiting for your manual input.
                  </span>
                </div>
              </label>

              {/* Recovery Attempts & Cancellation Fee Cap */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#162235]">
                <div>
                  <label htmlFor="attempt-cap" className="text-xs font-bold text-[#98A5BC] block mb-1.5">
                    Maximum recovery attempts
                  </label>
                  <select
                    id="attempt-cap"
                    value={maxAttempts}
                    onChange={(e) => setAttempts(Number(e.target.value))}
                    className="w-full rounded-xl bg-[#131E31] border border-[#22334D] px-3.5 py-2 text-xs font-semibold text-[#F6F8FC] focus:outline-none focus:border-[#B9FF45]"
                  >
                    <option value={0}>0 attempts (Never rebook)</option>
                    <option value={1}>1 attempt</option>
                    <option value={2}>2 attempts (Recommended)</option>
                    <option value={3}>3 attempts</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="fee-cap" className="text-xs font-bold text-[#98A5BC] block mb-1.5">
                    Max allowed cancellation fee
                  </label>
                  <select
                    id="fee-cap"
                    value={maxFee}
                    onChange={(e) => setMaxFee(Number(e.target.value))}
                    className="w-full rounded-xl bg-[#131E31] border border-[#22334D] px-3.5 py-2 text-xs font-semibold text-[#F6F8FC] focus:outline-none focus:border-[#B9FF45]"
                  >
                    <option value={0}>₹0 (Zero fee penalty)</option>
                    <option value={50}>₹50 max fee</option>
                    <option value={100}>₹100 max fee</option>
                  </select>
                </div>
              </div>

              <div className="rounded-xl bg-[#131E31] p-3 text-[11px] text-[#98A5BC] flex items-start gap-2">
                <Info className="h-4 w-4 text-[#38BDF8] shrink-0 mt-0.5" />
                <span>
                  <strong>Strict Preemptive Switch Rule:</strong> We will never cancel an active
                  ride simply because pickup risk is elevated. You always retain final approval on
                  preemptive provider switches.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Validation error banner */}
        {validationError && (
          <div role="alert" className="flex items-center gap-2.5 rounded-xl bg-[#FF6D76]/15 border border-[#FF6D76]/30 p-3.5 text-xs font-semibold text-[#FF6D76]">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        <label className="flex items-start gap-3 text-sm text-[#98A5BC]">
          <input
            type="checkbox"
            checked={stalledSimulation}
            onChange={(event) => setStalledSimulation(event.target.checked)}
            className="mt-1 h-4 w-4 accent-[#B9FF45]"
          />
          <span><strong className="text-[#F6F8FC]">Simulate a stalled pickup</strong><br />
            Use this trip to try an approval-based switch after booking.</span>
        </label>

        {/* Submission Button */}
        <div className="sticky bottom-0 z-20 -mx-1 flex flex-col items-center gap-2 rounded-2xl border border-[#304055] bg-[#101a2bf5] p-2.5 backdrop-blur">
          <Button
            type="submit"
            disabled={!locationData || !!parsedIntent || navigating}
            variant="primary"
            size="lg"
            fullWidth
            loading={busy || navigating}
            loadingText="Preparing simulated rides…"
            className="!bg-[#B9FF45] !text-[#090F1D] !border-[#B9FF45] font-black text-base shadow-[0_0_28px_rgba(185,255,69,0.35)] hover:brightness-105 active:scale-[0.99] h-14 rounded-2xl"
            rightIcon={<ArrowRight className="h-5 w-5 stroke-[2.5]" />}
          >
            Get ReHop’s recommendation
          </Button>

          <span className="text-xs font-medium text-[#bac7da] text-center">
            Simulation only. You confirm the ride on the next screen.
          </span>
        </div>
      </form>
    </div>
  );
}

export default BookingForm;
