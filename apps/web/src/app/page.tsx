'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Clock3, MapPin, Navigation, RefreshCw, ShieldCheck } from 'lucide-react';
import { RideIntro } from '@/components/ui/RideIntro';
import { api } from '@/lib/api/client';
import { DEFAULT_PICKUP_WAIT, PICKUP_WAIT_PRESETS } from '@/lib/pickup';

const sampleRoutes = [
  ['VIT Chennai', 'Chennai Airport'],
  ['Chennai Central Railway Station', 'Chennai Airport T2 (International)'],
  ['Chennai Egmore Railway Station', 'Government Museum, Egmore'],
];

const field = 'mt-1 w-full min-w-0 !rounded-xl !border-[#d9dbe7] !bg-white text-sm font-semibold !text-[#171b37] focus-visible:outline-2 focus-visible:outline-[#173ed7]';
const categories = [
  ['Airport, rail & bus', /airport|railway station|bus terminus|cmbt/i],
  ['Hospitals', /hospital|medical college|miot/i],
  ['Work & shopping', /it park|tidel|research park|marketcity|trade centre|express avenue/i],
  ['Parks, beaches & landmarks', /beach|park|temple|museum|lighthouse|boat house|zoo/i],
] as const;

function PlaceOptions({ places, blocked }: { places: string[]; blocked: string }) {
  const grouped = new Map<string, string[]>();
  for (const [category] of categories) grouped.set(category, []);
  grouped.set('Neighborhoods & campuses', []);
  for (const place of places) {
    const category = categories.find(([, pattern]) => pattern.test(place))?.[0] ?? 'Neighborhoods & campuses';
    grouped.get(category)?.push(place);
  }
  return [...grouped].filter(([, entries]) => entries.length > 0).map(([category, entries]) => (
    <optgroup key={category} label={category}>
      {entries.map((place) => <option key={place} disabled={place === blocked}>{place}</option>)}
    </optgroup>
  ));
}

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
    <div className="mx-auto max-w-6xl space-y-5 pb-8 lg:space-y-7">
      <RideIntro />
      <div className="grid items-stretch gap-5 lg:grid-cols-[.92fr_1.08fr] lg:gap-7">
        <section id="trip-planner" tabIndex={-1} aria-labelledby="home-title" className="min-w-0 scroll-mt-28 rounded-[28px] bg-[#fffdf8] p-5 sm:scroll-mt-20 sm:p-8">
          <h2 id="home-title" className="text-[clamp(2.65rem,5.8vw,5rem)] font-black leading-[.98] tracking-[-.065em] text-[#171b37]">
            Where to<span className="text-[#173ed7]">?</span>
          </h2>
          <p className="mt-3 mb-6 max-w-sm text-sm leading-relaxed text-[#475673] sm:text-base">Check the route and drive time before booking. Get pickup updates and a backup if your driver cancels.</p>
          <form onSubmit={continueTrip} className="space-y-3">
            <p className="text-xs font-semibold text-[#475673]">Popular places in Chennai</p>
            <label htmlFor="quick-pickup" className="block text-sm font-bold !text-[#171b37]">
              <span className="inline-flex items-center gap-2"><Navigation size={16} className="text-[#173ed7]" aria-hidden="true" /> Pickup point</span>
              <select id="quick-pickup" value={pickup} disabled={!labels.length || locations.isError} onChange={(event) => setPickup(event.target.value)} className={field}>
                {!labels.length && <option value="">Select pickup</option>}
                <PlaceOptions places={labels} blocked={dropoff} />
              </select>
            </label>
            <label htmlFor="quick-destination" className="block text-sm font-bold !text-[#171b37]">
              <span className="inline-flex items-center gap-2"><MapPin size={16} className="text-[#173ed7]" aria-hidden="true" /> Destination</span>
              <select id="quick-destination" value={dropoff} disabled={!labels.length || locations.isError} onChange={(event) => setDropoff(event.target.value)} className={field}>
                {!labels.length && <option value="">Select destination</option>}
                <PlaceOptions places={labels} blocked={pickup} />
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
        <section aria-labelledby="pickup-protection-title" className="relative isolate flex min-w-0 flex-col justify-end overflow-hidden rounded-[28px] bg-[#112575] px-5 pb-5 pt-32 text-white sm:px-8 sm:pb-8 sm:pt-40 lg:px-10 lg:pb-12">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-cover bg-[position:65%_40%]" style={{
            backgroundImage: 'linear-gradient(90deg, rgba(9,22,67,.76), rgba(9,22,67,.04) 90%), linear-gradient(0deg, #101f5e 3%, rgba(12,26,80,.84) 38%, transparent 82%), url(/images/pickup-protection-blue-hour.webp)',
          }} />
          <span className="mb-5 grid size-12 place-items-center rounded-2xl bg-[#ffb27d] text-[#20195c]">
            <ShieldCheck size={26} aria-hidden="true" />
          </span>
          <h2 id="pickup-protection-title" className="text-[clamp(2.1rem,4vw,3.5rem)] font-black leading-none tracking-[-.055em] !text-white">Pickup protection</h2>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#e4eaff] sm:text-base">RIDE &amp; SEEK tracks your pickup and helps you keep the trip moving.</p>
          <dl className="mt-6 grid gap-3">
            <div className="rounded-2xl border border-white/20 bg-[#0c1a54]/60 p-3.5 sm:p-4">
              <dt className="flex items-center gap-3 font-extrabold text-white"><Clock3 size={21} className="shrink-0 text-[#ffb27d]" aria-hidden="true" />Driver stalls</dt>
              <dd className="mt-1 pl-[33px] text-sm leading-relaxed text-[#e4eaff]">See a backup and decide whether to switch. Your current ride stays active while you decide.</dd>
            </div>
            <div className="rounded-2xl bg-[#ffdec8] p-3.5 text-[#281a3d] sm:p-4">
              <dt className="flex items-center gap-3 font-extrabold"><RefreshCw size={21} className="shrink-0 text-[#563580]" aria-hidden="true" />Driver cancels</dt>
              <dd className="mt-1 pl-[33px] text-sm leading-relaxed">Once cancellation is confirmed, we book an eligible backup within your limits and track the new pickup.</dd>
            </div>
          </dl>
          <Link href="/trips" className="mt-5 inline-flex min-h-10 w-fit items-center gap-2 rounded-lg font-bold text-[#ffcfaa] hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
            Your rides <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </section>
      </div>
    </div>
  );
}
