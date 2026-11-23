'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Ban, Clock3, MapPin, Play, Route, ShieldCheck } from 'lucide-react';
import HeroFilm from '@/components/landing/HeroFilm';
import styles from '@/components/landing/home.module.css';
import { api } from '@/lib/api/client';
import { DEFAULT_PICKUP_WAIT, PICKUP_WAIT_PRESETS } from '@/lib/pickup';

const sampleRoutes = [
  ['VIT Chennai', 'Chennai Airport'],
  ['Guindy', 'T Nagar'],
  ['T Nagar', 'Chennai Airport'],
];

const demoSteps = [
  { icon: Ban, title: 'The driver cancels', description: 'The simulator confirms the original ride is cancelled.' },
  { icon: Route, title: 'ReHop checks a backup', description: 'It checks availability, fare, and retry limits.' },
  { icon: ShieldCheck, title: 'ReHop books the replacement', description: 'The demo has already opted in to automatic recovery.' },
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
    <div className={styles.home}>
      <section aria-labelledby="home-title" className={styles.hero}>
        <HeroFilm />
        <div className={styles.heroInner}>
          <div className="min-w-0">
            <p className="mb-4 flex items-center gap-2.5 text-xs font-bold uppercase tracking-[.18em] text-[#d8ffa1] sm:mb-5">
              <span aria-hidden="true" className="h-px w-5 bg-[#B9FF45]" />
              Ride recovery simulator
            </p>
            <h1 id="home-title" className={styles.title}>Your ride. <span>No interruptions.</span></h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-[#dfebf9] sm:mt-5 sm:text-lg">
              Set your limits. ReHop recommends a ride, tracks your pickup, and can book a backup if your driver cancels.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5 sm:mt-7">
              <Link href="/book" className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#B9FF45] px-3 text-sm font-extrabold text-[#0a121a] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B9FF45] sm:flex-none sm:px-6">
                Find a ride <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <Link href="/demo" className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#dbe9fc]/40 bg-[#101b2c] px-3 text-sm font-bold text-white hover:bg-[#22324a] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B9FF45] sm:flex-none sm:px-6">
                <Play size={15} className="text-[#B9FF45]" aria-hidden="true" /> Try recovery demo
              </Link>
            </div>
          </div>

          <aside aria-labelledby="demo-preview-title" className={styles.demoPanel}>
            <h2 id="demo-preview-title" className="mb-4 text-lg font-extrabold tracking-tight">Inside the recovery demo</h2>
            <ol className="divide-y divide-[#d9e7fd]/15">
              {demoSteps.map(({ icon: Icon, title, description }) => (
                <li key={title} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[#B9FF45]/10 text-[#B9FF45]">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold">{title}</h3>
                    <p className="mt-0.5 text-xs leading-relaxed text-[#bdcbdd]">{description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </section>

      <div className={styles.body}>
        <section aria-labelledby="quick-trip-title" className="rounded-2xl border border-[#3c4f62] bg-[#111c2e] p-5 shadow-[0_14px_44px_#03071266] sm:p-7">
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

      </div>
    </div>
  );
}
