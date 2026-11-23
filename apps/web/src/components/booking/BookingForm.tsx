'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Car,
  Zap,
  Sparkles,
  ShieldCheck,
  Clock,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { Button, Card, Badge } from '@/components/ui';
import { api } from '@/lib/api/client';
import type { Journey, Location, RecoveryPolicy } from '@/types';
import { LocationInput, DEFAULT_LOCATIONS } from './LocationInput';
import { AiRequestInput, type ParsedIntentResult } from './AiRequestInput';
import { IntentReviewCard } from './IntentReviewCard';

export interface BookingFormProps {
  initialPickup?: string;
  initialDropoff?: string;
  initialNeedIn?: number;
  className?: string;
}

const VEHICLES = [
  {
    id: 'Hatchback',
    label: 'Hatchback',
    sublabel: 'Quick & economical',
    icon: Car,
    multiplier: 0.75,
  },
  {
    id: 'Sedan',
    label: 'Sedan',
    sublabel: 'Comfortable & AC',
    icon: Car,
    multiplier: 1.0,
  },
  {
    id: 'Auto',
    label: 'Auto',
    sublabel: 'Nimble city hop',
    icon: Zap,
    multiplier: 0.55,
  },
  {
    id: 'Premier',
    label: 'Premier',
    sublabel: 'Executive executive',
    icon: Sparkles,
    multiplier: 1.35,
  },
];

const DEADLINE_PRESETS = [15, 20, 30, 45, 60];
const BUDGET_PRESETS = [350, 500, 650, 900, 1200];

export function BookingForm({
  initialPickup = 'VIT Chennai',
  initialDropoff = 'Chennai Airport',
  initialNeedIn = 20,
  className = '',
}: BookingFormProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Locations query from backend
  const { data: locationData } = useQuery({
    queryKey: ['locations'],
    queryFn: api.locations,
    staleTime: 60000,
    retry: 1,
  });

  const availableLocations: Location[] = locationData?.locations || DEFAULT_LOCATIONS;

  // Form states
  const [pickup, setPickup] = useState(initialPickup);
  const [dropoff, setDropoff] = useState(initialDropoff);
  const [vehicle, setVehicle] = useState('Sedan');
  const [budget, setBudget] = useState(650);
  const [needInMinutes, setNeedInMinutes] = useState(initialNeedIn);

  // Safety limits states
  const [autoRebook, setAutoRebook] = useState(true);
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

  // Handle Intent confirmation
  const handleIntentConfirmed = (confirmed: {
    pickup: string;
    dropoff: string;
    need_in_minutes: number;
    budget: number;
    vehicle_type: string;
  }) => {
    setPickup(confirmed.pickup);
    setDropoff(confirmed.dropoff);
    setNeedInMinutes(confirmed.need_in_minutes);
    setBudget(confirmed.budget);
    setVehicle(confirmed.vehicle_type);
    setParsedIntent(null); // Return to standard view or submit directly
    executeSubmission({
      targetPickup: confirmed.pickup,
      targetDropoff: confirmed.dropoff,
      targetNeedIn: confirmed.need_in_minutes,
      targetBudget: confirmed.budget,
    });
  };

  const resolveLocation = (label: string): Location => {
    const found = availableLocations.find(
      (l) => l.label.toLowerCase() === label.trim().toLowerCase()
    );
    if (found) return found;

    // Generated coordinate fallback for custom typed locations
    return {
      label: label.trim(),
      lat: 12.9 + Math.random() * 0.1,
      lng: 80.1 + Math.random() * 0.1,
    };
  };

  const executeSubmission = async (override?: {
    targetPickup?: string;
    targetDropoff?: string;
    targetNeedIn?: number;
    targetBudget?: number;
  }) => {
    setValidationError(null);

    const actualPickup = override?.targetPickup || pickup;
    const actualDropoff = override?.targetDropoff || dropoff;
    const actualNeedIn = override?.targetNeedIn || needInMinutes;
    const actualBudget = override?.targetBudget || budget;

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
    if (!actualBudget || actualBudget <= 0) {
      setValidationError('Please enter a valid maximum budget greater than ₹0.');
      return;
    }

    setBusy(true);

    const fromLoc = resolveLocation(actualPickup);
    const toLoc = resolveLocation(actualDropoff);

    const policy: RecoveryPolicy = {
      auto_rebook_on_confirmed_driver_cancel: autoRebook,
      max_total_fare_inr: actualBudget,
      max_recovery_attempts: maxAttempts,
      preemptive_switch_requires_approval: true,
      allow_same_provider_retry: true,
      max_cancellation_fee_inr: maxFee,
    };

    // Need_by simulation timestamp (UTC ISO format)
    const simulatedBase = Date.parse('2026-11-23T08:30:00Z');
    const needByIso = new Date(simulatedBase + actualNeedIn * 60000).toISOString();

    try {
      // 1. Try real backend API
      const journey = await api.createJourney(fromLoc, toLoc, policy, needByIso);
      startTransition(() => {
        router.push(`/compare?journey=${journey.id}`);
      });
    } catch {
      // 2. Offline / network failure fallback:
      // Generate fully compliant simulated journey object saved in sessionStorage
      const simId = `sim-${Date.now().toString(36)}`;
      const baseFare = actualBudget;

      const simJourney: Journey = {
        id: simId,
        pickup: fromLoc,
        dropoff: toLoc,
        state: 'OFFERED',
        version: 1,
        active_ride_id: null,
        active_ride: null,
        last_ride: null,
        quotes: [
          {
            quote_id: `q-a-${Date.now()}`,
            provider: 'PROVIDER_A',
            estimated_fare_inr: Math.max(120, Math.round(baseFare * 0.76)),
            pickup_eta_sec: 180,
            expires_at: new Date(Date.now() + 600000).toISOString(),
            is_simulated: true,
          },
          {
            quote_id: `q-b-${Date.now()}`,
            provider: 'PROVIDER_B',
            estimated_fare_inr: Math.max(140, Math.round(baseFare * 0.84)),
            pickup_eta_sec: 240,
            expires_at: new Date(Date.now() + 600000).toISOString(),
            is_simulated: true,
          },
          {
            quote_id: `q-c-${Date.now()}`,
            provider: 'PROVIDER_C',
            estimated_fare_inr: Math.max(160, Math.round(baseFare * 0.94)),
            pickup_eta_sec: 320,
            expires_at: new Date(Date.now() + 600000).toISOString(),
            is_simulated: true,
          },
          {
            quote_id: `q-d-${Date.now()}`,
            provider: 'PROVIDER_D',
            estimated_fare_inr: Math.max(130, Math.round(baseFare * 0.79)),
            pickup_eta_sec: 420,
            expires_at: new Date(Date.now() + 600000).toISOString(),
            is_simulated: true,
          },
        ],
        risk: null,
        pending_backup: null,
        recovery_attempts: 0,
        policy,
        scenario: 'S01',
        simulated_time: new Date().toISOString(),
        is_simulated: true,
        booking_uncertain: false,
        last_event_seq: 0,
        need_by: needByIso,
        driver_chat_signal: null,
        deadline_decision: null,
        cancellation_fee_notice: null,
      };

      if (typeof window !== 'undefined') {
        sessionStorage.setItem(`journey_${simId}`, JSON.stringify(simJourney));
        sessionStorage.setItem('last_simulated_journey', JSON.stringify(simJourney));
      }

      startTransition(() => {
        router.push(`/compare?journey=${simId}`);
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSubmission();
  };

  return (
    <div className={`flex flex-col gap-8 max-w-3xl mx-auto w-full ${className}`}>
      {/* 1. AI Request Natural Language Card */}
      <AiRequestInput onIntentParsed={handleIntentParsed} />

      {/* 2. AI Request Review Card (Displayed if intent is parsed) */}
      {parsedIntent && (
        <IntentReviewCard
          intent={parsedIntent}
          onConfirmAndFind={handleIntentConfirmed}
          onEditManually={() => setParsedIntent(null)}
        />
      )}

      {/* 3. Main Booking Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-7">
        {/* Locations (Pickup & Destination) */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#98A5BC]">
              Route Details
            </span>
            <span className="text-[11px] font-semibold text-[#B9FF45]">
              Simulated City Grid
            </span>
          </div>

          <LocationInput
            pickup={pickup}
            dropoff={dropoff}
            onPickupChange={setPickup}
            onDropoffChange={setDropoff}
            availableLocations={availableLocations}
          />
        </section>

        {/* Vehicle Preference Selector */}
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#98A5BC]">
              Vehicle Category
            </span>
            <span className="text-xs font-medium text-[#98A5BC]">
              Selected: <strong className="text-[#F6F8FC]">{vehicle}</strong>
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {VEHICLES.map((v) => {
              const isSelected = vehicle.toLowerCase() === v.id.toLowerCase();
              const Icon = v.icon;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVehicle(v.id)}
                  className={`group relative flex flex-col items-start p-3.5 rounded-2xl border text-left transition-all duration-150 ${
                    isSelected
                      ? 'bg-[#18263E] border-[#B9FF45] shadow-[0_0_20px_rgba(185,255,69,0.2)] scale-[1.02]'
                      : 'bg-[#11192A] border-[#22334D] hover:bg-[#152035] hover:border-[#334B70]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-2">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                        isSelected
                          ? 'bg-[#B9FF45] text-[#090F1D]'
                          : 'bg-[#1E2C44] text-[#98A5BC] group-hover:text-[#F6F8FC]'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    {isSelected && (
                      <span className="h-2 w-2 rounded-full bg-[#B9FF45] shadow-[0_0_6px_#B9FF45]" />
                    )}
                  </div>

                  <span className="text-sm font-extrabold text-[#F6F8FC]">{v.label}</span>
                  <span className="text-[11px] font-medium text-[#98A5BC] mt-0.5 leading-tight">
                    {v.sublabel}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Arrival Deadline & Budget (2 Column Grid) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Arrival Deadline (need_by in simulated minutes) */}
          <Card className="!p-5 bg-[#0E1726] border-[#1E2E46]">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-extrabold uppercase tracking-wider text-[#98A5BC] flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-[#B9FF45]" />
                Pickup needed in
              </label>
              <span className="text-sm font-black text-[#B9FF45]">
                {needInMinutes} mins
              </span>
            </div>

            <p className="text-[11px] text-[#98A5BC] mb-3">
              ReHop uses this deadline to recommend proactive backup switches.
            </p>

            {/* Quick chips */}
            <div className="flex flex-wrap gap-1.5 mb-3.5">
              {DEADLINE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setNeedInMinutes(preset)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    needInMinutes === preset
                      ? 'bg-[#B9FF45] text-[#090F1D] shadow-sm'
                      : 'bg-[#151F32] text-[#98A5BC] hover:text-[#F6F8FC] border border-[#22334D]'
                  }`}
                >
                  {preset}m
                </button>
              ))}
            </div>

            {/* Range Slider */}
            <input
              type="range"
              min={5}
              max={120}
              step={5}
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
              <label className="text-xs font-extrabold uppercase tracking-wider text-[#98A5BC] flex items-center gap-1.5">
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
                type="number"
                min={100}
                max={10000}
                step={50}
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
                  <label className="text-xs font-bold text-[#98A5BC] block mb-1.5">
                    Maximum recovery attempts
                  </label>
                  <select
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
                  <label className="text-xs font-bold text-[#98A5BC] block mb-1.5">
                    Max allowed cancellation fee
                  </label>
                  <select
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
          <div className="flex items-center gap-2.5 rounded-xl bg-[#FF6D76]/15 border border-[#FF6D76]/30 p-3.5 text-xs font-semibold text-[#FF6D76]">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Disclosures & Simulation Notice */}
        <div className="rounded-xl bg-[#151F32]/60 border border-[#243249]/60 px-4 py-3 flex items-center justify-between gap-3 text-xs text-[#98A5BC]">
          <div className="flex items-center gap-2">
            <Badge variant="simulation" size="sm" dot>
              Simulated
            </Badge>
            <span>Prices and ETAs are simulated. No live booking until confirmed.</span>
          </div>
        </div>

        {/* Submission Button */}
        <div className="flex flex-col items-center gap-2.5 pt-2">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={busy}
            loadingText="Preparing simulated rides…"
            className="!bg-[#B9FF45] !text-[#090F1D] !border-[#B9FF45] font-black text-base shadow-[0_0_28px_rgba(185,255,69,0.35)] hover:brightness-105 active:scale-[0.99] h-14 rounded-2xl"
            rightIcon={<ArrowRight className="h-5 w-5 stroke-[2.5]" />}
          >
            Find available rides
          </Button>

          <span className="text-xs font-semibold text-[#64748B] text-center">
            No booking is placed until you confirm.
          </span>
        </div>
      </form>
    </div>
  );
}

export default BookingForm;
