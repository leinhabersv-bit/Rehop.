'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Clock3, MapPin, Navigation, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import { api } from '@/lib/api/client';
import { DEFAULT_PICKUP_WAIT, PICKUP_WAIT_PRESETS } from '@/lib/pickup';

const sampleRoutes = [
  ['VIT Chennai', 'Chennai Airport'],
  ['Chennai Central Railway Station', 'Chennai Airport T2 (International)'],
];

const field = 'mt-1 w-full min-w-0 !rounded-xl !border-[#d9dbe7] !bg-white text-sm font-semibold !text-[#171b37] focus-visible:outline-2 focus-visible:outline-[#173ed7]';

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
    <div className="mx-auto max-w-6xl pb-8">
      <div className="grid items-stretch gap-5 lg:grid-cols-[.92fr_1.08fr] lg:gap-7">
        <section aria-labelledby="home-title" className="min-w-0 rounded-[28px] bg-[#fffdf8] p-5 sm:p-8">
          <p className="mb-3 inline-flex rounded-full bg-[#ffdec8] px-3 py-1 text-xs font-bold text-[#573125]">Rides with a backup plan</p>
          <h1 id="home-title" className="text-[clamp(2.65rem,5.8vw,5rem)] font-black leading-[.98] tracking-[-.065em] text-[#171b37]">
            Where to<span className="text-[#173ed7]">?</span>
          </h1>
          <p className="mt-3 mb-6 max-w-sm text-sm leading-relaxed text-[#475673] sm:text-base">Book a ride, follow your pickup, and get help finding a backup if your driver cancels.</p>
          <form onSubmit={continueTrip} className="space-y-3">
            <p className="text-xs font-semibold text-[#475673]">Popular places in Chennai</p>
            <label htmlFor="quick-pickup" className="block text-sm font-bold !text-[#171b37]">
              <span className="inline-flex items-center gap-2"><Navigation size={16} className="text-[#173ed7]" aria-hidden="true" /> Pickup point</span>
              <select id="quick-pickup" value={pickup} disabled={!labels.length || locations.isError} onChange={(event) => setPickup(event.target.value)} className={field}>
                {!labels.length && <option value="">Select pickup</option>}
                {labels.map((label) => <option key={label} disabled={label === dropoff}>{label}</option>)}
              </select>
            </label>
            <label htmlFor="quick-destination" className="block text-sm font-bold !text-[#171b37]">
              <span className="inline-flex items-center gap-2"><MapPin size={16} className="text-[#173ed7]" aria-hidden="true" /> Destination</span>
              <select id="quick-destination" value={dropoff} disabled={!labels.length || locations.isError} onChange={(event) => setDropoff(event.target.value)} className={field}>
                {!labels.length && <option value="">Select destination</option>}
                {labels.map((label) => <option key={label} disabled={label === pickup}>{label}</option>)}
              </select>
            </label>
            <label htmlFor="quick-deadline" className="block text-sm font-bold !text-[#171b37]">
              <span className="inline-flex items-center gap-2"><Clock3 size={16} className="text-[#173ed7]" aria-hidden="true" /> Maximum pickup wait</span>
              <select id="quick-deadline" value={wait} onChange={(event) => setWait(Number(event.target.value))} className={field}>
                {PICKUP_WAIT_PRESETS.map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
              </select>
            </label>
            {locations.isPending && <p role="status" className="text-sm text-[#475673]">Loading pickup points…</p>}
            {locations.isError && <p role="alert" className="text-sm text-[#a42644]">Pickup points are unavailable. <button type="button" onClick={() => void locations.refetch()} className="font-bold underline">Try again</button></p>}
            <button type="submit" disabled={!ready} className="inline-flex min-h-12 w-full items-center justify-between gap-2 rounded-xl bg-[#173ed7] px-4 text-sm font-extrabold text-white hover:bg-[#1232b5]">
              Review trip details <ArrowRight size={18} aria-hidden="true" />
            </button>
          </form>
          <Link href={`/book?search=1&needIn=${wait}`} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg text-sm font-bold text-[#173ed7] hover:underline">
            <MapPin size={16} aria-hidden="true" /> Search any address or landmark
          </Link>
          {ready && <div className="mt-4 flex flex-wrap gap-2" aria-label="Suggested routes">
            {sampleRoutes.filter(([from, to]) => labels.includes(from) && labels.includes(to)).map(([from, to]) => (
              <button key={from} type="button" onClick={() => { setPickup(from); setDropoff(to); }} className="min-h-9 rounded-full border border-[#d9dbe7] px-3 text-xs font-bold text-[#334363] hover:border-[#173ed7]">
                {from} → {to}
              </button>
            ))}
          </div>}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs text-[#475673] underline">Places © OpenStreetMap contributors</a>
        </section>
        <aside className="relative flex min-h-[340px] min-w-0 flex-col justify-end overflow-hidden rounded-[28px] bg-[#173ed7] text-white lg:min-h-[560px]">
          <Image src="/images/rehop-cobalt.webp" alt="" fill priority sizes="(min-width: 1024px) 600px, 100vw" className="object-cover object-[64%_center]" />
          <div className="relative bg-gradient-to-t from-[#10257c]/95 via-[#10257c]/80 to-transparent px-6 pb-6 pt-24 sm:px-8 sm:pb-8">
            <ShieldCheck size={24} className="mb-2 text-[#ffb27d]" aria-hidden="true" />
            <h2 className="text-2xl font-black tracking-tight !text-white">Pickup protection</h2>
            <p className="mt-1 max-w-sm text-sm leading-relaxed text-white">If your ride stalls, you decide whether to switch. If your driver cancels, RIDE &amp; SEEK books the best available backup within your limits and tracks it for you.</p>
            <Link href="/trips" className="mt-3 inline-flex items-center gap-2 rounded-lg font-bold text-[#ffcfaa]">Your rides <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
