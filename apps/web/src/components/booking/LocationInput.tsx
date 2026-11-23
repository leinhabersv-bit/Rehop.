'use client';

import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpDown, MapPin, Navigation, Search } from 'lucide-react';
import { retryMapRequest, searchPlaces } from '@/lib/maps';
import type { Location } from '@/types';

export const DEFAULT_LOCATIONS: Location[] = [
  { label: 'VIT Chennai', lat: 12.8405315, lng: 80.1530341 },
  { label: 'Chennai Airport', lat: 12.9825533, lng: 80.167339 },
  { label: 'Indiranagar 100ft Rd', lat: 12.9716, lng: 77.6412 },
  { label: 'Koramangala 4th Block', lat: 12.9345, lng: 77.6264 },
  { label: 'T. Nagar', lat: 13.0418, lng: 80.2341 },
  { label: 'OMR IT Corridor', lat: 12.9150, lng: 80.2280 },
];

interface PlaceFieldProps {
  label: string;
  value: string;
  locations: Location[];
  onChange: (value: string) => void;
  onSelect: (place: Location) => void;
  pickup?: boolean;
}

function PlaceField({ label, value, locations, onChange, onSelect, pickup }: PlaceFieldProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState('');
  const query = value.trim();
  const submitted = requested === query ? requested : '';
  const search = useQuery({
    queryKey: ['map-places', submitted],
    queryFn: ({ signal }) => searchPlaces(submitted, signal),
    enabled: open && submitted.length >= 3,
    staleTime: 15 * 60_000,
    retry: retryMapRequest,
  });
  const suggestions = locations.filter((place) => place.label.toLowerCase().includes(query.toLowerCase()));
  const mapResults = search.data?.places ?? [];
  const places = submitted ? [
    ...suggestions,
    ...mapResults.filter((result) => !suggestions.some((place) => place.lat === result.lat && place.lng === result.lng)),
  ] : suggestions;
  const Icon = pickup ? Navigation : MapPin;

  function submitSearch() {
    if (query.length < 3) return;
    setOpen(true);
    if (submitted === query && search.isError) void search.refetch();
    setRequested(query);
  }

  return (
    <div
      className="relative min-w-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}
    >
      <div className="flex items-center gap-2 rounded-xl border border-[#d9dbe7] bg-white px-2.5 py-1.5 focus-within:border-[#173ed7] sm:gap-3 sm:px-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#edf1ff] text-[#173ed7]">
          <Icon size={16} aria-hidden="true" />
        </span>
        <label htmlFor={id} className="min-w-0 flex-1">
          <span className="block text-xs font-bold text-[#475673]">{label}</span>
          <input
            id={id}
            value={value}
            maxLength={160}
            autoComplete="off"
            placeholder={pickup ? 'Address or landmark' : 'Where are you going?'}
            onChange={(event) => {
              onChange(event.target.value);
              setRequested('');
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              submitSearch();
            }}
            className="w-full !border-0 !bg-transparent !p-0 text-base font-semibold text-[#171b37] sm:text-sm"
          />
        </label>
        <button
          type="button"
          aria-label={`Search for ${label.toLowerCase()}`}
          disabled={query.length < 3}
          onClick={submitSearch}
          className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-bold text-[#173ed7] hover:bg-[#edf1ff] disabled:opacity-40"
        >
          <Search size={16} aria-hidden="true" /><span className="hidden sm:inline">Search</span>
        </button>
      </div>
      {open && (places.length > 0 || submitted) && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-xl border border-[#d9dbe7] bg-[#fffdf8] p-1 shadow-lg">
          {submitted && search.isFetching && <p role="status" className="p-2 text-sm text-[#475673]">Searching the map…</p>}
          {submitted && search.isError && <p role="alert" className="p-2 text-sm text-[#a42644]">{search.error.message}</p>}
          {submitted && search.isSuccess && !places.length && <p role="status" className="p-2 text-sm text-[#475673]">No places found. Add a city or nearby landmark.</p>}
          {places.map((place) => (
            <button
              key={`${place.lat},${place.lng}`}
              type="button"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(place);
                setRequested('');
                setOpen(false);
              }}
              className="flex w-full items-start gap-2 rounded-lg p-2 text-left text-sm font-semibold text-[#171b37] hover:bg-[#edf1ff] focus-visible:bg-[#edf1ff]"
            >
              <MapPin size={16} className="mt-0.5 shrink-0 text-[#173ed7]" aria-hidden="true" />
              <span>{place.label}</span>
            </button>
          ))}
          {submitted && <a href="https://www.openstreetmap.org/copyright" className="block px-2 py-1 text-xs text-[#475673] underline" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>}
        </div>
      )}
    </div>
  );
}

export interface LocationInputProps {
  pickup: string;
  dropoff: string;
  onPickupChange: (location: string) => void;
  onDropoffChange: (location: string) => void;
  onPickupSelect: (location: Location) => void;
  onDropoffSelect: (location: Location) => void;
  onSwap: () => void;
  availableLocations?: Location[];
}

export function LocationInput({
  pickup, dropoff, onPickupChange, onDropoffChange, onPickupSelect, onDropoffSelect, onSwap,
  availableLocations = DEFAULT_LOCATIONS,
}: LocationInputProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border border-[#d9dbe7] bg-[#edf1ff] p-2 sm:gap-3 sm:p-3">
      <div className="grid min-w-0 gap-2">
        <PlaceField pickup label="Pickup location" value={pickup} locations={availableLocations} onChange={onPickupChange} onSelect={onPickupSelect} />
        <PlaceField label="Destination" value={dropoff} locations={availableLocations} onChange={onDropoffChange} onSelect={onDropoffSelect} />
      </div>
      <button
        type="button"
        onClick={onSwap}
        aria-label="Swap pickup and destination"
        className="grid size-9 place-items-center rounded-xl border border-[#d9dbe7] bg-white text-[#173ed7] hover:border-[#173ed7] sm:size-10"
      >
        <ArrowUpDown size={17} aria-hidden="true" />
      </button>
    </div>
  );
}

export default LocationInput;
