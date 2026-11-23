'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Play,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Layers,
  Activity,
  Clock,
  Radar,
  MapPin,
  ChevronRight,
  Info,
  Timer,
  Shield,
} from 'lucide-react';
import { Badge, Card } from '@/components/ui';

export default function HomePage() {
  const router = useRouter();

  // Quick booking preview state
  const [pickup, setPickup] = useState('VIT Chennai');
  const [dropoff, setDropoff] = useState('Chennai Airport');
  const [needInMinutes, setNeedInMinutes] = useState('20');
  const [simulatedEta, setSimulatedEta] = useState(4);

  const sampleLocations = [
    'VIT Chennai',
    'Chennai Airport',
    'Tambaram Station',
    'Guindy Metro',
    'Tidal Park OMR',
    'Chennai Central',
  ];

  const handleQuickBook = (e: React.FormEvent) => {
    e.preventDefault();
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Headlines & Call to Actions */}
          <div className="lg:col-span-7 flex flex-col items-start gap-6">
            {/* Eyebrow badge */}
            <Badge
              variant="simulation"
              size="md"
              dot
              className="border-[#B9FF45]/40 text-[#B9FF45] bg-[#B9FF45]/10 px-3.5 py-1 text-xs uppercase tracking-widest font-extrabold"
            >
              AI-POWERED RIDE RECOVERY · SIMULATION ENGINE
            </Badge>

            {/* Hero Headline */}
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight text-[#F6F8FC] leading-[1.08] m-0">
              Your ride.
              <span className="block mt-1 bg-gradient-to-r from-[#B9FF45] via-[#d7ff7b] to-[#2ED389] bg-clip-text text-transparent">
                No interruptions.
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl font-semibold text-[#F6F8FC]/90 max-w-2xl leading-snug">
              The intelligent ride companion that finds, monitors and recovers your pickup.
            </p>

            {/* Description */}
            <p className="text-sm sm:text-base text-[#98A5BC] max-w-2xl leading-relaxed">
              Never get stranded by sudden cab cancellations again. ReHop continuously tracks driver
              trajectory, computes pickup risk, and prepares verified backup rides before your
              schedule is broken.
            </p>

            {/* Hero Action Buttons */}
            <div className="flex flex-wrap items-center gap-3.5 pt-2 w-full sm:w-auto">
              <Link
                href="/book"
                className="inline-flex items-center justify-center gap-2.5 px-6 sm:px-7 py-3.5 rounded-2xl bg-[#B9FF45] text-[#090F1D] font-extrabold text-sm sm:text-base hover:brightness-105 transition-all shadow-[0_0_24px_rgba(185,255,69,0.35)] active:scale-95 group w-full sm:w-auto"
              >
                Find a ride
                <ArrowRight className="w-5 h-5 stroke-[2.5] transition-transform group-hover:translate-x-1" />
              </Link>

              <Link
                href="/demo"
                className="inline-flex items-center justify-center gap-2 px-5 sm:px-6 py-3.5 rounded-2xl bg-[#151F32] hover:bg-[#243249] text-[#F6F8FC] border border-[#243249] font-bold text-sm sm:text-base transition-all hover:border-[#384c6c] active:scale-95 w-full sm:w-auto"
              >
                <Play className="w-4 h-4 fill-current text-[#B9FF45]" />
                Try Incident Demo
              </Link>

              <Link
                href="/compare"
                className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-transparent hover:bg-[#151F32] text-[#98A5BC] hover:text-[#F6F8FC] border border-[#243249] font-semibold text-sm transition-all active:scale-95 w-full sm:w-auto"
              >
                <Sparkles className="w-4 h-4 text-[#B79CFF]" />
                Compare Providers
              </Link>
            </div>

            {/* Trust Badges Row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 text-xs font-semibold text-[#98A5BC]">
              <span className="inline-flex items-center gap-1.5 text-[#2ED389]">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                No duplicate bookings by default
              </span>
              <span className="text-[#243249] hidden sm:inline">•</span>
              <span className="inline-flex items-center gap-1.5 text-[#F6F8FC]/80">
                <CheckCircle2 className="w-4 h-4 text-[#B9FF45] shrink-0" />
                Simulated Providers A–D
              </span>
              <span className="text-[#243249] hidden sm:inline">•</span>
              <span className="inline-flex items-center gap-1.5 text-[#98A5BC]">
                <Activity className="w-4 h-4 text-[#B79CFF] shrink-0" />
                5s Telemetry Ticks
              </span>
            </div>
          </div>

          {/* Right Column: Live Pickup Preview Widget (matching 01_Landing_Desktop.png) */}
          <div className="lg:col-span-5">
            <div className="relative rounded-[24px] border border-[#243249] bg-[#151F32]/95 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-md overflow-hidden">
              {/* Atmospheric background glow */}
              <div className="absolute -top-16 -right-16 w-48 h-48 bg-[#B9FF45]/10 rounded-full blur-3xl pointer-events-none" />

              {/* Widget Header */}
              <div className="flex items-center justify-between pb-4 border-b border-[#243249]">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#B9FF45]/15 text-[#B9FF45]">
                    <Radar className="w-4 h-4 animate-spin" style={{ animationDuration: '8s' }} />
                  </span>
                  <span className="font-bold text-sm text-[#F6F8FC] tracking-tight">
                    Live pickup preview
                  </span>
                </div>
                <Badge variant="simulation" size="sm" dot>
                  SIMULATION
                </Badge>
              </div>

              {/* Map Route Canvas Simulation */}
              <div className="relative my-4 h-52 w-full rounded-2xl bg-[#090F1D] border border-[#243249]/80 p-3 overflow-hidden flex flex-col justify-between">
                {/* Simulated Street Grid pattern */}
                <svg
                  className="absolute inset-0 w-full h-full opacity-35"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <pattern id="grid-pattern" width="30" height="30" patternUnits="userSpaceOnUse">
                      <path
                        d="M 30 0 L 0 0 0 30"
                        fill="none"
                        stroke="#243249"
                        strokeWidth="0.8"
                      />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid-pattern)" />
                </svg>

                {/* Simulated Vector Route */}
                <svg
                  className="absolute inset-0 w-full h-full"
                  viewBox="0 0 400 200"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* Outer ambient glow path */}
                  <path
                    d="M 40 160 C 110 165, 120 40, 210 60 S 320 160, 360 40"
                    stroke="#B9FF45"
                    strokeWidth="8"
                    strokeLinecap="round"
                    className="opacity-25"
                  />
                  {/* Primary neon lime route */}
                  <path
                    d="M 40 160 C 110 165, 120 40, 210 60 S 320 160, 360 40"
                    stroke="#B9FF45"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                  {/* Directional animated dash */}
                  <path
                    d="M 40 160 C 110 165, 120 40, 210 60 S 320 160, 360 40"
                    stroke="#FFFFFF"
                    strokeWidth="2"
                    strokeDasharray="6 14"
                    strokeLinecap="round"
                    className="opacity-70"
                  />

                  {/* Origin Node (Solid Lime) */}
                  <circle cx="40" cy="160" r="7" fill="#B9FF45" />
                  <circle cx="40" cy="160" r="14" fill="#B9FF45" className="opacity-30 animate-ping" />

                  {/* Destination Node (Pickup Target) */}
                  <circle cx="360" cy="40" r="7" fill="#2ED389" />
                  <circle cx="360" cy="40" r="14" stroke="#2ED389" strokeWidth="2" strokeDasharray="3 3" />

                  {/* Simulated Car Marker Midway */}
                  <g transform="translate(200, 52)">
                    <rect
                      x="-24"
                      y="-14"
                      width="48"
                      height="28"
                      rx="8"
                      fill="#151F32"
                      stroke="#B9FF45"
                      strokeWidth="1.5"
                    />
                    <circle cx="-12" cy="14" r="3.5" fill="#B9FF45" />
                    <circle cx="12" cy="14" r="3.5" fill="#B9FF45" />
                  </g>
                </svg>

                {/* Floating Map Labels */}
                <div className="relative z-10 flex justify-between items-start pointer-events-none">
                  <span className="text-[10px] font-bold text-[#98A5BC] bg-[#151F32]/80 px-2 py-0.5 rounded border border-[#243249]">
                    VIT Chennai
                  </span>
                  <span className="text-[10px] font-bold text-[#2ED389] bg-[#151F32]/80 px-2 py-0.5 rounded border border-[#2ED389]/40">
                    Pickup Spot
                  </span>
                </div>

                <div className="relative z-10 flex justify-between items-end pointer-events-none">
                  <span className="text-[10px] font-bold text-[#B9FF45] bg-[#090F1D]/90 px-2.5 py-1 rounded-md border border-[#B9FF45]/30">
                    Provider A · Sedan
                  </span>
                  <span className="text-[10px] text-[#98A5BC] bg-[#090F1D]/80 px-2 py-0.5 rounded">
                    GPS: 12.8406° N, 80.1534° E
                  </span>
                </div>
              </div>

              {/* Metrics Dock: 2 Mini Cards */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="rounded-xl border border-[#243249] bg-[#1A273F] p-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#98A5BC]">
                    Driver ETA
                  </span>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-3xl font-black text-[#F6F8FC]">
                      0{simulatedEta}
                    </span>
                    <span className="text-xs font-semibold text-[#98A5BC]">min</span>
                  </div>
                  <span className="text-[11px] text-[#2ED389] font-medium flex items-center gap-1 mt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#2ED389]" />
                    On track · 38 km/h
                  </span>
                </div>

                <div className="rounded-xl border border-[#243249] bg-[#1A273F] p-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#98A5BC]">
                    Recovery State
                  </span>
                  <div className="mt-1">
                    <span className="inline-flex items-center gap-1.5 text-base font-extrabold text-[#B9FF45]">
                      <ShieldCheck className="w-4 h-4 text-[#B9FF45]" />
                      Backup ready
                    </span>
                  </div>
                  <span className="text-[11px] text-[#98A5BC] font-medium block mt-1 truncate">
                    Provider B standby (+₹15)
                  </span>
                </div>
              </div>

              {/* Interactive Telemetry Ticker */}
              <div className="mt-3 flex items-center justify-between text-[11px] text-[#98A5BC] bg-[#090F1D]/60 rounded-xl px-3 py-2 border border-[#243249]/60">
                <span className="truncate pr-2">Risk index: 12% · No anomaly flagged</span>
                <button
                  type="button"
                  onClick={() => setSimulatedEta((prev) => (prev > 1 ? prev - 1 : 6))}
                  className="text-[#B9FF45] font-bold hover:underline shrink-0"
                >
                  Tick 5s
                </button>
              </div>
            </div>
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
                  Instant Setup
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-[#F6F8FC] mt-1 mb-0">
                Quick Booking Simulator
              </h2>
              <p className="text-xs sm:text-sm text-[#98A5BC] mt-1 mb-0">
                Test simulated ride matching and recovery policy with your preferred pickup deadline.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start md:self-auto">
              <Badge variant="neutral" size="sm">
                Max 2 recovery retries
              </Badge>
              <Badge variant="primary" size="sm">
                Zero double charges
              </Badge>
            </div>
          </div>

          <form onSubmit={handleQuickBook} className="mt-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Pickup selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#98A5BC] flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#B9FF45]" />
                  Pickup Point
                </label>
                <div className="relative">
                  <select
                    value={pickup}
                    onChange={(e) => setPickup(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-[#243249] bg-[#090F1D] px-4 py-3 text-sm font-semibold text-[#F6F8FC] focus:border-[#B9FF45] focus:outline-none focus:ring-1 focus:ring-[#B9FF45]"
                  >
                    {sampleLocations.map((loc) => (
                      <option key={loc} value={loc} className="bg-[#151F32]">
                        {loc}
                      </option>
                    ))}
                  </select>
                  <ChevronRight className="pointer-events-none absolute right-3.5 top-3.5 w-4 h-4 rotate-90 text-[#98A5BC]" />
                </div>
              </div>

              {/* Destination selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#98A5BC] flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#2ED389]" />
                  Destination
                </label>
                <div className="relative">
                  <select
                    value={dropoff}
                    onChange={(e) => setDropoff(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-[#243249] bg-[#090F1D] px-4 py-3 text-sm font-semibold text-[#F6F8FC] focus:border-[#B9FF45] focus:outline-none focus:ring-1 focus:ring-[#B9FF45]"
                  >
                    {sampleLocations.map((loc) => (
                      <option key={loc} value={loc} className="bg-[#151F32]">
                        {loc}
                      </option>
                    ))}
                  </select>
                  <ChevronRight className="pointer-events-none absolute right-3.5 top-3.5 w-4 h-4 rotate-90 text-[#98A5BC]" />
                </div>
              </div>

              {/* Need By Deadline selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#98A5BC] flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5 text-[#B79CFF]" />
                  Pickup Needed Within
                </label>
                <div className="relative">
                  <select
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
                      45 minutes (Airport)
                    </option>
                  </select>
                  <ChevronRight className="pointer-events-none absolute right-3.5 top-3.5 w-4 h-4 rotate-90 text-[#98A5BC]" />
                </div>
              </div>
            </div>

            {/* Quick Route Suggestion Chips */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-[#98A5BC] font-medium mr-1">Popular routes:</span>
              <button
                type="button"
                onClick={() => {
                  setPickup('VIT Chennai');
                  setDropoff('Chennai Airport');
                  setNeedInMinutes('20');
                }}
                className="px-3 py-1 rounded-lg text-xs font-medium bg-[#1A273F] text-[#F6F8FC] hover:border-[#B9FF45] border border-[#243249] transition-colors"
              >
                VIT Chennai → Airport
              </button>
              <button
                type="button"
                onClick={() => {
                  setPickup('Tambaram Station');
                  setDropoff('Tidal Park OMR');
                  setNeedInMinutes('30');
                }}
                className="px-3 py-1 rounded-lg text-xs font-medium bg-[#1A273F] text-[#F6F8FC] hover:border-[#B9FF45] border border-[#243249] transition-colors"
              >
                Tambaram → Tidal Park
              </button>
              <button
                type="button"
                onClick={() => {
                  setPickup('Guindy Metro');
                  setDropoff('Chennai Central');
                  setNeedInMinutes('15');
                }}
                className="px-3 py-1 rounded-lg text-xs font-medium bg-[#1A273F] text-[#F6F8FC] hover:border-[#B9FF45] border border-[#243249] transition-colors"
              >
                Guindy → Chennai Central
              </button>
            </div>

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
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-[#B9FF45] text-[#090F1D] font-extrabold text-sm hover:brightness-105 transition-all shadow-[0_2px_12px_rgba(185,255,69,0.3)] active:scale-95"
              >
                Find available rides
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
            Engineered for pickup certainty
          </h2>
          <p className="text-sm sm:text-base text-[#98A5BC]">
            Four architectural safeguards ensuring your ride is reliably monitored and safely
            rescued if a driver stalls or cancels.
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
                  Multi-Provider Aggregation
                </h3>
                <p className="text-sm text-[#98A5BC] leading-relaxed">
                  Access simulated fleets across neutral providers simultaneously. Compare real-time
                  simulated ETAs, fares, and vehicle tiers in one unified view without switching
                  between proprietary apps.
                </p>
              </div>
            </div>

            <div className="pt-6 mt-4 border-t border-[#243249]/80 flex items-center justify-between text-xs text-[#98A5BC]">
              <span className="font-semibold text-[#F6F8FC]">Unified Mobility Protocol</span>
              <span className="text-[#B9FF45] font-bold">4 Simulated Fleets</span>
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
                  Real-time Telemetry
                </Badge>
              </div>

              <div>
                <h3 className="text-lg sm:text-xl font-bold text-[#F6F8FC] mb-2">
                  Early Delay & Risk Detection
                </h3>
                <p className="text-sm text-[#98A5BC] leading-relaxed">
                  Our telemetry intelligence scores heading anomalies, stationary stall cycles, and
                  speed variance every 5 seconds—flagging potential pickup failures minutes before
                  legacy ride-hailing apps notify you.
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
                  Zero Duplicate Bookings
                </Badge>
              </div>

              <div>
                <h3 className="text-lg sm:text-xl font-bold text-[#F6F8FC] mb-2">
                  Safe Pre-emptive Switch
                </h3>
                <p className="text-sm text-[#98A5BC] leading-relaxed">
                  Strict policy guarantees you are never double-billed. An original ride is verified
                  as cancelled before any replacement is confirmed. Every preemptive switch requires
                  your explicit consent with full cancellation fee disclosure.
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
                  need_by Priority
                </Badge>
              </div>

              <div>
                <h3 className="text-lg sm:text-xl font-bold text-[#F6F8FC] mb-2">
                  Deadline-Aware Routing
                </h3>
                <p className="text-sm text-[#98A5BC] leading-relaxed">
                  Prioritizes pickup feasibility against your hard arrival deadline (
                  <code className="text-[#B9FF45] font-mono text-xs">need_by</code>). Compares the
                  cost of waiting against the cost of switching so you never trigger an unneeded
                  recovery when your driver is on schedule.
                </p>
              </div>
            </div>

            <div className="pt-6 mt-4 border-t border-[#243249]/80 flex items-center justify-between text-xs text-[#98A5BC]">
              <span className="font-semibold text-[#F6F8FC]">Arrival Guarantee</span>
              <span className="text-[#FFBD63] font-bold">Dynamic Urgency Scoring</span>
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
            From your first search to verified arrival, our engine continuously monitors, detects
            delays, and safeguards your schedule.
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
                Choose your pickup, destination, and arrival deadline. Define safety caps for maximum
                fare and acceptable cancellation fees before any ride is placed.
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
                Continuous Trajectory Monitoring
              </h3>
              <p className="text-xs sm:text-sm text-[#98A5BC] leading-relaxed">
                ReHop tracks simulated driver progress, calculating distance delta, heading variance,
                and risk score on deterministic 5-second ticks.
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
                Verified Pre-emptive Recovery
              </h3>
              <p className="text-xs sm:text-sm text-[#98A5BC] leading-relaxed">
                If driver cancellation is imminent or delay threatens your deadline, ReHop stages a
                backup quote and seamlessly switches upon your approval.
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
                Simulation Transparency Notice
              </h4>
              <p className="text-xs sm:text-sm text-[#98A5BC] leading-relaxed m-0">
                All providers, driver positions, and fares shown are simulated. Demonstrator for
                ONDC/Beckn-inspired ride recovery. Neutral providers (Provider A, B, C, D) are
                illustrative entities with synthetic ETAs and pricing.
              </p>
            </div>
            <Badge variant="simulation" size="sm" className="shrink-0">
              Hackathon Prototype
            </Badge>
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
              Ready to experience resilient ride recovery?
            </h2>
            <p className="text-sm sm:text-base text-[#98A5BC] leading-relaxed">
              Test our simulation engine with interactive driver stall incidents or search simulated
              routes across multiple providers.
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
              <Link
                href="/compare"
                className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-transparent hover:bg-[#151F32] text-[#98A5BC] hover:text-[#F6F8FC] border border-[#243249] font-semibold text-sm transition-all active:scale-95"
              >
                <Sparkles className="w-4 h-4 text-[#B79CFF]" />
                Compare Providers
              </Link>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
