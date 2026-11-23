'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Play,
  ShieldCheck,
  CheckCircle2,
  Layers,
  Activity,
  Clock,
  MapPin,
  ChevronRight,
  Info,
  Timer,
  Shield,
} from 'lucide-react';
import PickupPreview from '@/components/landing/PickupPreview';
import { Badge, Card } from '@/components/ui';
import { api } from '@/lib/api/client';

const quickRoutes = [
  { pickup: 'VIT Chennai', dropoff: 'Chennai Airport', minutes: '20' },
  { pickup: 'Guindy', dropoff: 'T Nagar', minutes: '30' },
  { pickup: 'T Nagar', dropoff: 'Chennai Airport', minutes: '15' },
];

export default function HomePage() {
  const router = useRouter();

  const locations = useQuery({ queryKey: ['locations'], queryFn: api.locations, staleTime: 60_000, retry: 1 });
  const labels = locations.data?.locations.map(({ label }) => label) ?? [];
  const [pickupChoice, setPickup] = useState<string>();
  const [dropoffChoice, setDropoff] = useState<string>();
  const [needInMinutes, setNeedInMinutes] = useState('20');
  const pickup = pickupChoice ?? labels[0] ?? '';
  const dropoff = dropoffChoice ?? labels[1] ?? '';
  const canContinue = !locations.isError && pickup !== dropoff && labels.includes(pickup) && labels.includes(dropoff);

  const handleQuickBook = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canContinue) return;
    const query = new URLSearchParams({
      pickup,
      dropoff,
      needIn: needInMinutes,
    });
    router.push(`/book?${query.toString()}`);
  };

  return (
    <div className="flex flex-col gap-16 md:gap-24 pb-12">
      {/* 1. HERO SECTION */}
      <section className="relative pt-4 sm:pt-8 md:pt-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12 lg:gap-8 items-center">
          {/* Left Column: Headlines & Call to Actions */}
          <div className="min-w-0 lg:col-span-6 flex flex-col items-start gap-5 sm:gap-6">
            {/* Eyebrow badge */}
            <Badge
              variant="simulation"
              size="md"
              dot
              className="border-[#B9FF45]/40 text-[#B9FF45] bg-[#B9FF45]/10 px-3.5 py-1 text-xs uppercase tracking-widest font-extrabold"
            >
              Simulated ride recovery
            </Badge>

            {/* Hero Headline */}
            <h1 className="text-4xl sm:text-6xl lg:text-[3.65rem] xl:text-[4rem] font-black tracking-tight text-[#F6F8FC] leading-[1.08] m-0">
              Your ride.
              <span className="block mt-1 bg-gradient-to-r from-[#B9FF45] via-[#d7ff7b] to-[#2ED389] bg-clip-text text-transparent">
                No interruptions.
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl font-semibold text-[#F6F8FC]/90 max-w-2xl leading-snug">
              Compare rides, watch your pickup, and find a backup when plans change.
            </p>

            {/* Hero Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5 pt-2 w-full sm:w-auto sm:gap-3.5">
              <Link
                href="/book"
                className="inline-flex flex-1 items-center justify-center gap-2 px-3 sm:flex-none sm:px-7 py-3.5 rounded-2xl bg-[#B9FF45] text-[#090F1D] font-extrabold text-sm sm:text-base hover:brightness-105 transition-all shadow-[0_0_24px_rgba(185,255,69,0.35)] active:scale-95 group whitespace-nowrap"
              >
                Find a ride
                <ArrowRight className="w-5 h-5 stroke-[2.5] transition-transform group-hover:translate-x-1" />
              </Link>

              <Link
                href="/demo"
                className="inline-flex flex-1 items-center justify-center gap-2 px-3 sm:flex-none sm:px-6 py-3.5 rounded-2xl bg-[#151F32] hover:bg-[#243249] text-[#F6F8FC] border border-[#243249] font-bold text-sm sm:text-base transition-all hover:border-[#384c6c] active:scale-95 whitespace-nowrap"
              >
                <Play className="w-4 h-4 fill-current text-[#B9FF45]" />
                Try the demo
              </Link>

            </div>

            {/* Trust Badges Row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 text-xs font-semibold text-[#98A5BC]">
              <span className="inline-flex items-center gap-1.5 text-[#2ED389]">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                One active ride per journey
              </span>
              <span className="text-[#243249] hidden sm:inline">•</span>
              <span className="inline-flex items-center gap-1.5 text-[#F6F8FC]/80">
                <CheckCircle2 className="w-4 h-4 text-[#B9FF45] shrink-0" />
                Simulated Providers A–D
              </span>
            </div>
          </div>

          <div className="min-w-0 lg:col-span-6">
            <PickupPreview />
          </div>
        </div>
      </section>

      {/* 2. INTERACTIVE QUICK-BOOKING PREVIEW WIDGET */}
      <section className="relative">
        <Card
          elevated
          hoverGlow
          glowVariant="primary"
          className="relative border-[#243249] bg-gradient-to-b from-[#151F32] to-[#121B2C] p-6 sm:p-8"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#243249]">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-[#B9FF45]" />
                <span className="text-xs font-bold uppercase tracking-wider text-[#B9FF45]">
                  Trip setup
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-[#F6F8FC] mt-1 mb-0">
                Plan a simulated ride
              </h2>
              <p className="text-xs sm:text-sm text-[#98A5BC] mt-1 mb-0">
                Choose a route and the latest time you can be picked up.
              </p>
            </div>

          </div>

          <form onSubmit={handleQuickBook} className="mt-6 space-y-6">
            {locations.isPending && <p role="status" className="text-sm text-[#98A5BC]">Loading locations…</p>}
            {locations.isError && <p role="alert" className="text-sm text-[#FFBD63]">
              Location list unavailable. <button type="button" className="underline" onClick={() => void locations.refetch()}>Try again</button>
            </p>}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Pickup selector */}
              <div className="space-y-2">
                <label htmlFor="quick-pickup" className="text-xs font-bold uppercase tracking-wider text-[#98A5BC] flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#B9FF45]" />
                  Pickup Point
                </label>
                <div className="relative">
                  <select
                    id="quick-pickup"
                    value={pickup}
                    disabled={!labels.length || locations.isError}
                    onChange={(e) => setPickup(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-[#243249] bg-[#090F1D] px-4 py-3 text-sm font-semibold text-[#F6F8FC] focus:border-[#B9FF45] focus:outline-none focus:ring-1 focus:ring-[#B9FF45]"
                  >
                    {labels.map((loc) => (
                      <option key={loc} value={loc} disabled={loc === dropoff} className="bg-[#151F32]">
                        {loc}
                      </option>
                    ))}
                  </select>
                  <ChevronRight className="pointer-events-none absolute right-3.5 top-3.5 w-4 h-4 rotate-90 text-[#98A5BC]" />
                </div>
              </div>

              {/* Destination selector */}
              <div className="space-y-2">
                <label htmlFor="quick-destination" className="text-xs font-bold uppercase tracking-wider text-[#98A5BC] flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#2ED389]" />
                  Destination
                </label>
                <div className="relative">
                  <select
                    id="quick-destination"
                    value={dropoff}
                    disabled={!labels.length || locations.isError}
                    onChange={(e) => setDropoff(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-[#243249] bg-[#090F1D] px-4 py-3 text-sm font-semibold text-[#F6F8FC] focus:border-[#B9FF45] focus:outline-none focus:ring-1 focus:ring-[#B9FF45]"
                  >
                    {labels.map((loc) => (
                      <option key={loc} value={loc} disabled={loc === pickup} className="bg-[#151F32]">
                        {loc}
                      </option>
                    ))}
                  </select>
                  <ChevronRight className="pointer-events-none absolute right-3.5 top-3.5 w-4 h-4 rotate-90 text-[#98A5BC]" />
                </div>
              </div>

              {/* Need By Deadline selector */}
              <div className="space-y-2">
                <label htmlFor="quick-deadline" className="text-xs font-bold uppercase tracking-wider text-[#98A5BC] flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5 text-[#B79CFF]" />
                  Pickup Needed Within
                </label>
                <div className="relative">
                  <select
                    id="quick-deadline"
                    value={needInMinutes}
                    onChange={(e) => setNeedInMinutes(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-[#243249] bg-[#090F1D] px-4 py-3 text-sm font-semibold text-[#F6F8FC] focus:border-[#B9FF45] focus:outline-none focus:ring-1 focus:ring-[#B9FF45]"
                  >
                    <option value="15" className="bg-[#151F32]">
                      15 minutes (Urgent)
                    </option>
                    <option value="20" className="bg-[#151F32]">
                      20 minutes (Standard)
                    </option>
                    <option value="30" className="bg-[#151F32]">
                      30 minutes (Flexible)
                    </option>
                    <option value="45" className="bg-[#151F32]">
                      45 minutes
                    </option>
                  </select>
                  <ChevronRight className="pointer-events-none absolute right-3.5 top-3.5 w-4 h-4 rotate-90 text-[#98A5BC]" />
                </div>
              </div>
            </div>

            {/* Quick Route Suggestion Chips */}
            {canContinue && <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-[#98A5BC] font-medium mr-1">Try a route</span>
              {quickRoutes.filter((route) => labels.includes(route.pickup) && labels.includes(route.dropoff)).map((route) => (
                <button
                  key={`${route.pickup}-${route.dropoff}`}
                  type="button"
                  onClick={() => {
                    setPickup(route.pickup);
                    setDropoff(route.dropoff);
                    setNeedInMinutes(route.minutes);
                  }}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-[#1A273F] text-[#F6F8FC] hover:border-[#B9FF45] border border-[#243249] transition-colors"
                >
                  {route.pickup} → {route.dropoff}
                </button>
              ))}
            </div>}

            {/* Submit Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-[#243249]">
              <div className="flex items-center gap-2 text-xs text-[#98A5BC] text-center sm:text-left">
                <Shield className="w-4 h-4 text-[#B9FF45] shrink-0" />
                <span>
                  No real booking is placed. Quotes, ETAs and driver trajectories are simulated.
                </span>
              </div>

              <button
                type="submit"
                disabled={!canContinue}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-[#B9FF45] text-[#090F1D] font-extrabold text-sm hover:brightness-105 transition-all shadow-[0_2px_12px_rgba(185,255,69,0.3)] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Review trip details
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </form>
        </Card>
      </section>

      {/* 3. VALUE PROPOSITIONS / FEATURES GRID (4 Cards) */}
      <section className="space-y-6">
        <div className="flex flex-col items-start gap-2 max-w-2xl">
          <Badge variant="simulation" size="sm" dot>
            Core Architecture
          </Badge>
          <h2 className="text-2xl sm:text-3xl font-black text-[#F6F8FC]">
            How ReHop helps at pickup
          </h2>
          <p className="text-sm sm:text-base text-[#98A5BC]">
            Follow driver progress and decide what to do when a pickup is at risk.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Multi-Provider Aggregation */}
          <Card
            hoverGlow
            glowVariant="primary"
            className="flex flex-col justify-between p-6 sm:p-7 group"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#B9FF45]/15 text-[#B9FF45] group-hover:scale-105 transition-transform">
                  <Layers className="w-6 h-6 stroke-[2]" />
                </span>
                <Badge variant="neutral" size="sm">
                  Provider A · B · C · D
                </Badge>
              </div>

              <div>
                <h3 className="text-lg sm:text-xl font-bold text-[#F6F8FC] mb-2">
                  Compare Providers
                </h3>
                <p className="text-sm text-[#98A5BC] leading-relaxed">
                  Compare estimated pickup times and fares from four simulated providers.
                  See which quotes fit your fare cap and pickup deadline.
                </p>
              </div>
            </div>

            <div className="pt-6 mt-4 border-t border-[#243249]/80 flex items-center justify-between text-xs text-[#98A5BC]">
              <span className="font-semibold text-[#F6F8FC]">Fare and pickup ETA</span>
              <span className="text-[#B9FF45] font-bold">4 simulated providers</span>
            </div>
          </Card>

          {/* Card 2: Early Delay & Risk Detection */}
          <Card
            hoverGlow
            glowVariant="ai"
            className="flex flex-col justify-between p-6 sm:p-7 group"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#B79CFF]/15 text-[#B79CFF] group-hover:scale-105 transition-transform">
                  <Activity className="w-6 h-6 stroke-[2]" />
                </span>
                <Badge variant="ai" size="sm">
                  Simulated Telemetry
                </Badge>
              </div>

              <div>
                <h3 className="text-lg sm:text-xl font-bold text-[#F6F8FC] mb-2">
                  Early Delay & Risk Detection
                </h3>
                <p className="text-sm text-[#98A5BC] leading-relaxed">
                  ReHop uses time spent stationary, ETA changes and distance to pickup to estimate
                  risk. Stale location readings are marked as uncertain.
                </p>
              </div>
            </div>

            <div className="pt-6 mt-4 border-t border-[#243249]/80 flex items-center justify-between text-xs text-[#98A5BC]">
              <span className="font-semibold text-[#F6F8FC]">Deterministic Telemetry</span>
              <span className="text-[#B79CFF] font-bold">5-Second Ticks</span>
            </div>
          </Card>

          {/* Card 3: Safe Pre-emptive Switch */}
          <Card
            hoverGlow
            glowVariant="primary"
            className="flex flex-col justify-between p-6 sm:p-7 group"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2ED389]/15 text-[#2ED389] group-hover:scale-105 transition-transform">
                  <ShieldCheck className="w-6 h-6 stroke-[2]" />
                </span>
                <Badge variant="success" size="sm">
                  Verified Cancellation
                </Badge>
              </div>

              <div>
                <h3 className="text-lg sm:text-xl font-bold text-[#F6F8FC] mb-2">
                  Safe Pre-emptive Switch
                </h3>
                <p className="text-sm text-[#98A5BC] leading-relaxed">
                  Preview the possible fee before deciding whether to switch. ReHop checks a fresh
                  backup quote and waits for cancellation confirmation before booking a replacement.
                </p>
              </div>
            </div>

            <div className="pt-6 mt-4 border-t border-[#243249]/80 flex items-center justify-between text-xs text-[#98A5BC]">
              <span className="font-semibold text-[#F6F8FC]">Policy Controlled</span>
              <span className="text-[#2ED389] font-bold">Rider Approval Required</span>
            </div>
          </Card>

          {/* Card 4: Deadline-Aware Routing */}
          <Card
            hoverGlow
            glowVariant="primary"
            className="flex flex-col justify-between p-6 sm:p-7 group"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFBD63]/15 text-[#FFBD63] group-hover:scale-105 transition-transform">
                  <Clock className="w-6 h-6 stroke-[2]" />
                </span>
                <Badge variant="warning" size="sm">
                  Pickup Deadline
                </Badge>
              </div>

              <div>
                <h3 className="text-lg sm:text-xl font-bold text-[#F6F8FC] mb-2">
                  Wait or Switch
                </h3>
                <p className="text-sm text-[#98A5BC] leading-relaxed">
                  Set the latest time you can be picked up. ReHop compares the risk of waiting
                  with the cost and estimated pickup time of switching.
                </p>
              </div>
            </div>

            <div className="pt-6 mt-4 border-t border-[#243249]/80 flex items-center justify-between text-xs text-[#98A5BC]">
              <span className="font-semibold text-[#F6F8FC]">Pickup time</span>
              <span className="text-[#FFBD63] font-bold">Explained Recommendation</span>
            </div>
          </Card>
        </div>
      </section>

      {/* 4. "HOW REHOP WORKS" 3-STEP WALKTHROUGH */}
      <section className="space-y-8">
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <Badge variant="simulation" size="sm" dot>
            Three-Stage Safeguard
          </Badge>
          <h2 className="text-2xl sm:text-4xl font-black text-[#F6F8FC]">
            How ReHop Protects Your Journey
          </h2>
          <p className="text-sm sm:text-base text-[#98A5BC]">
            From trip setup to boarding confirmation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          {/* Step 1 */}
          <div className="relative rounded-[20px] border border-[#243249] bg-[#151F32] p-6 sm:p-8 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-3xl font-black text-[#B9FF45]">01</span>
                <Badge variant="neutral" size="sm">
                  Setup
                </Badge>
              </div>
              <h3 className="text-lg font-bold text-[#F6F8FC]">
                Set Route & Safety Limits
              </h3>
              <p className="text-xs sm:text-sm text-[#98A5BC] leading-relaxed">
                Choose your pickup, destination and pickup deadline. Set your maximum fare,
                cancellation fee and retry count before booking.
              </p>
            </div>
            <div className="pt-6 mt-6 border-t border-[#243249] text-xs font-semibold text-[#B9FF45]">
              Step 1 · Input & Caps
            </div>
          </div>

          {/* Step 2 */}
          <div className="relative rounded-[20px] border border-[#243249] bg-[#151F32] p-6 sm:p-8 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-3xl font-black text-[#B79CFF]">02</span>
                <Badge variant="ai" size="sm">
                  Telemetry
                </Badge>
              </div>
              <h3 className="text-lg font-bold text-[#F6F8FC]">
                Watch Driver Progress
              </h3>
              <p className="text-xs sm:text-sm text-[#98A5BC] leading-relaxed">
                Follow driver distance and ETA as the simulation advances in five-second steps.
                Confirm boarding after the driver reaches the pickup point.
              </p>
            </div>
            <div className="pt-6 mt-6 border-t border-[#243249] text-xs font-semibold text-[#B79CFF]">
              Step 2 · Anomaly Detection
            </div>
          </div>

          {/* Step 3 */}
          <div className="relative rounded-[20px] border border-[#243249] bg-[#151F32] p-6 sm:p-8 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-3xl font-black text-[#2ED389]">03</span>
                <Badge variant="success" size="sm">
                  Rescue
                </Badge>
              </div>
              <h3 className="text-lg font-bold text-[#F6F8FC]">
                Review Recovery Options
              </h3>
              <p className="text-xs sm:text-sm text-[#98A5BC] leading-relaxed">
                If a delay threatens pickup, review the quote and possible cancellation fee.
                Backup availability can change before confirmation.
              </p>
            </div>
            <div className="pt-6 mt-6 border-t border-[#243249] text-xs font-semibold text-[#2ED389]">
              Step 3 · Safe Dispatch
            </div>
          </div>
        </div>
      </section>

      {/* 5. SIMULATION TRANSPARENCY BANNER */}
      <section>
        <div className="relative rounded-[20px] border border-[#FFBD63]/30 bg-gradient-to-r from-[#FFBD63]/10 via-[#151F32] to-[#151F32] p-5 sm:p-6 text-sm text-[#98A5BC] shadow-lg">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFBD63]/20 text-[#FFBD63]">
              <Info className="w-5 h-5 stroke-[2.5]" />
            </span>
            <div className="flex-1 space-y-1">
              <h4 className="text-sm font-bold text-[#F6F8FC] tracking-tight m-0">
                Simulation only
              </h4>
              <p className="text-xs sm:text-sm text-[#98A5BC] leading-relaxed m-0">
                Provider A–D, vehicle positions, estimates, and cancellation fees are simulated.
                ReHop uses local adapters inspired by ONDC and Beckn.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. BOTTOM CALL-TO-ACTION SECTION */}
      <section>
        <Card
          elevated
          hoverGlow
          glowVariant="primary"
          className="relative text-center p-8 sm:p-12 overflow-hidden border-[#243249]"
        >
          {/* Subtle lime glow orb */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-[#B9FF45]/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-2xl mx-auto space-y-4">
            <h2 className="text-2xl sm:text-4xl font-black text-[#F6F8FC] tracking-tight m-0">
              Try a stalled pickup
            </h2>
            <p className="text-sm sm:text-base text-[#98A5BC] leading-relaxed">
              Run a demo scenario to see why ReHop recommends waiting or switching.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3.5 pt-4">
              <Link
                href="/book"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl bg-[#B9FF45] text-[#090F1D] font-extrabold text-sm sm:text-base hover:brightness-105 transition-all shadow-[0_0_24px_rgba(185,255,69,0.3)] active:scale-95"
              >
                Find a ride
                <ArrowRight className="w-5 h-5 stroke-[2.5]" />
              </Link>
              <Link
                href="/demo"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-[#243249] hover:bg-[#2e3e58] text-[#F6F8FC] font-bold text-sm sm:text-base transition-all active:scale-95"
              >
                <Play className="w-4 h-4 fill-current text-[#B9FF45]" />
                Try Incident Demo
              </Link>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
