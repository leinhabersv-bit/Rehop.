'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Clock3, MapPin, Play, Route, ShieldCheck } from 'lucide-react';
import PickupPreview from '@/components/landing/PickupPreview';
import { api } from '@/lib/api/client';
import { DEFAULT_PICKUP_WAIT, PICKUP_WAIT_PRESETS } from '@/lib/pickup';

const sampleRoutes = [
  ['VIT Chennai', 'Chennai Airport'],
  ['Guindy', 'T Nagar'],
  ['T Nagar', 'Chennai Airport'],
];

const steps = [
  { icon: Route, title: 'Get a recommendation', description: 'ReHop picks the lowest fare that meets your maximum wait and fare cap.' },
  { icon: Clock3, title: 'Watch your pickup', description: 'See the driver’s estimated arrival and whether the pickup is at risk.' },
  { icon: ShieldCheck, title: 'Approve a safer backup', description: 'If a switch makes sense, review the backup and any fees before approving.' },
];

const field = 'mt-2 w-full min-w-0 rounded-xl border border-[#34445a] bg-[#0b1422] px-3.5 py-3.5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B9FF45] disabled:opacity-60';

export default function HomePage() {
  const router = useRouter();
  const locations = useQuery({ queryKey: ['locations'], queryFn: api.locations, staleTime: 60_000 });
  const labels = locations.data?.locations.map(({ label }) => label) ?? [];
  const [pickupChoice, setPickup] = useState('');
  const [dropoffChoice, setDropoff] = useState('');
  const [wait, setWait] = useState(DEFAULT_PICKUP_WAIT);
  const pickup = pickupChoice || labels[0] || '';
  const dropoff = dropoffChoice || labels[1] || '';
  const ready = !locations.isError && pickup !== dropoff && labels.includes(pickup) && labels.includes(dropoff);

  function continueTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) return;
    router.push('/book?' + new URLSearchParams({ pickup, dropoff, needIn: String(wait) }));
  }

  return (
    <div className="space-y-10 pb-8 sm:space-y-14">
      <section className="grid items-center gap-6 sm:gap-9 lg:grid-cols-[1fr_1.06fr] lg:gap-10 lg:pt-6">
        <div className="min-w-0 space-y-4 sm:space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-[#B9FF45]/25 bg-[#B9FF45]/10 px-3 py-1 text-xs font-bold text-[#d7ffa4]">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-[#B9FF45]" />
            Ride recovery simulator
          </p>
          <h1 className="text-[clamp(2.35rem,5.25vw,4.1rem)] font-black leading-[1.04] tracking-tight">
            Your ride.<span className="block text-[#B9FF45]">No interruptions.</span>
          </h1>
          <p className="max-w-md text-base leading-relaxed text-[#bdc9db] sm:text-lg">
            Set your limits. ReHop recommends a ride, watches your pickup, and finds a backup if plans change.
          </p>
          <div className="flex flex-wrap gap-2.5 pt-1">
            <Link href="/book" className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#B9FF45] px-3 text-sm font-extrabold text-[#0a121a] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B9FF45] sm:flex-none sm:px-6">
              Find a ride <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link href="/demo" className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#36475e] bg-[#152138] px-3 text-sm font-bold hover:bg-[#22324a] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B9FF45] sm:flex-none sm:px-6">
              <Play size={15} className="text-[#B9FF45]" aria-hidden="true" /> Try recovery demo
            </Link>
          </div>
          <p className="flex items-center gap-2 text-xs font-medium text-[#b3c2d8]">
            <ShieldCheck size={16} className="shrink-0 text-[#B9FF45]" aria-hidden="true" />
            One active ride. You approve preemptive switches.
          </p>
        </div>
        <PickupPreview />
      </section>

      <section aria-labelledby="quick-trip-title" className="rounded-3xl border border-[#304055] bg-[#111c2e] p-5 sm:p-8">
        <div className="mb-5">
          <h2 id="quick-trip-title" className="text-2xl font-black tracking-tight sm:text-3xl">Plan your trip</h2>
          <p className="mt-1 text-sm leading-relaxed text-[#bac7da]">Choose a route and how long you can wait. You’ll see the driver’s estimated pickup time after ReHop compares providers.</p>
        </div>
        <form onSubmit={continueTrip} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <label htmlFor="quick-pickup" className="min-w-0 text-sm font-semibold">
              <span className="inline-flex items-center gap-1.5"><MapPin size={15} className="text-[#B9FF45]" aria-hidden="true" /> Pickup point</span>
              <select id="quick-pickup" value={pickup} disabled={!labels.length || locations.isError} onChange={(event) => setPickup(event.target.value)} className={field}>
                {!labels.length && <option value="">Select pickup</option>}
                {labels.map((label) => <option key={label} disabled={label === dropoff}>{label}</option>)}
              </select>
            </label>
            <label htmlFor="quick-destination" className="min-w-0 text-sm font-semibold">
              <span className="inline-flex items-center gap-1.5"><MapPin size={15} className="text-[#B9FF45]" aria-hidden="true" /> Destination</span>
              <select id="quick-destination" value={dropoff} disabled={!labels.length || locations.isError} onChange={(event) => setDropoff(event.target.value)} className={field}>
                {!labels.length && <option value="">Select destination</option>}
                {labels.map((label) => <option key={label} disabled={label === pickup}>{label}</option>)}
              </select>
            </label>
            <label htmlFor="quick-deadline" className="min-w-0 text-sm font-semibold">
              <span className="inline-flex items-center gap-1.5"><Clock3 size={15} className="text-[#B79CFF]" aria-hidden="true" /> Maximum pickup wait</span>
              <select id="quick-deadline" value={wait} onChange={(event) => setWait(Number(event.target.value))} className={field}>
                {PICKUP_WAIT_PRESETS.map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
              </select>
            </label>
          </div>
          {locations.isPending && <p role="status" className="text-sm text-[#bac7da]">Loading simulated pickup points…</p>}
          {locations.isError && <p role="alert" className="text-sm text-[#FF9CA1]">Pickup points are unavailable. <button type="button" onClick={() => void locations.refetch()} className="font-bold underline">Try again</button></p>}
          {ready && <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[#b3c2d8]">Example routes</span>
            {sampleRoutes.filter(([from, to]) => labels.includes(from) && labels.includes(to)).map(([from, to]) => (
              <button key={from} type="button" onClick={() => { setPickup(from); setDropoff(to); }} className="min-h-9 rounded-full border border-[#34445a] px-3 text-xs font-semibold hover:border-[#B9FF45] focus-visible:outline-2 focus-visible:outline-[#B9FF45]">
                {from} → {to}
              </button>
            ))}
          </div>}
          <div className="flex flex-col gap-3 border-t border-[#304055] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[#b3c2d8]">All fares, pickups, and bookings are simulated.</p>
            <button type="submit" disabled={!ready} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#B9FF45] px-5 text-sm font-extrabold text-[#0a121a] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B9FF45]">
              Review trip details <ArrowRight size={17} aria-hidden="true" />
            </button>
          </div>
        </form>
      </section>

      <section aria-labelledby="how-rehop-works">
        <h2 id="how-rehop-works" className="mb-4 text-2xl font-black tracking-tight">From booking to backup</h2>
        <ol className="grid gap-3 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, description }) => (
            <li key={title} className="rounded-2xl border border-[#27374d] bg-[#101a2b] p-5">
              <Icon size={20} className="mb-3 text-[#B9FF45]" aria-hidden="true" />
              <h3 className="font-bold">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-[#b3c2d8]">{description}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
