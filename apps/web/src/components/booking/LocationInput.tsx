'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MapPin, Navigation, ArrowUpDown, Check, ChevronDown } from 'lucide-react';
import type { Location } from '@/types';

export const DEFAULT_LOCATIONS: Location[] = [
  { label: 'VIT Chennai', lat: 12.8406, lng: 80.1534 },
  { label: 'Chennai Airport', lat: 12.9941, lng: 80.1709 },
  { label: 'Indiranagar 100ft Rd', lat: 12.9716, lng: 77.6412 },
  { label: 'Koramangala 4th Block', lat: 12.9345, lng: 77.6264 },
  { label: 'T. Nagar', lat: 13.0418, lng: 80.2341 },
  { label: 'OMR IT Corridor', lat: 12.9150, lng: 80.2280 },
];

export interface LocationInputProps {
  pickup: string;
  dropoff: string;
  onPickupChange: (location: string) => void;
  onDropoffChange: (location: string) => void;
  onSwap?: () => void;
  availableLocations?: Location[];
  error?: string;
}

export function LocationInput({
  pickup,
  dropoff,
  onPickupChange,
  onDropoffChange,
  onSwap,
  availableLocations = DEFAULT_LOCATIONS,
  error,
}: LocationInputProps) {
  const [pickupOpen, setPickupOpen] = useState(false);
  const [dropoffOpen, setDropoffOpen] = useState(false);
  const pickupRef = useRef<HTMLDivElement>(null);
  const dropoffRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pickupRef.current && !pickupRef.current.contains(e.target as Node)) {
        setPickupOpen(false);
      }
      if (dropoffRef.current && !dropoffRef.current.contains(e.target as Node)) {
        setDropoffOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSwap = () => {
    if (onSwap) {
      onSwap();
    } else {
      const prevPickup = pickup;
      onPickupChange(dropoff);
      onDropoffChange(prevPickup);
    }
  };

  const filteredPickupSuggestions = availableLocations.filter((loc) =>
    loc.label.toLowerCase().includes(pickup.toLowerCase())
  );

  const filteredDropoffSuggestions = availableLocations.filter((loc) =>
    loc.label.toLowerCase().includes(dropoff.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="relative rounded-2xl bg-[#0E1726] border border-[#1E293B] p-4 sm:p-5 shadow-[0_8px_32px_rgba(0,0,0,0.36)]">
        {/* Swap button placed absolutely between inputs */}
        <div className="absolute right-4 sm:right-6 top-1/2 -translate-y-1/2 z-10">
          <button
            type="button"
            onClick={handleSwap}
            aria-label="Swap pickup and destination"
            title="Swap pickup and destination"
            className="group flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-[#1A273F] border border-[#2B3B55] text-[#B9FF45] hover:bg-[#243552] hover:border-[#B9FF45]/60 hover:scale-105 active:scale-95 transition-all duration-150 shadow-md"
          >
            <ArrowUpDown className="h-4 w-4 sm:h-5 sm:w-5 transition-transform duration-200 group-hover:rotate-180" />
          </button>
        </div>

        {/* Inputs container */}
        <div className="flex flex-col gap-3 pr-12 sm:pr-14">
          {/* Pickup Block */}
          <div ref={pickupRef} className="relative">
            <div className="flex items-center gap-3 rounded-xl bg-[#131E31] border border-[#22334D] px-3.5 py-2.5 transition-colors focus-within:border-[#B9FF45] focus-within:ring-1 focus-within:ring-[#B9FF45]/30">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#B9FF45]/15 text-[#B9FF45]">
                <Navigation className="h-4 w-4" />
              </div>
              <div className="flex flex-1 flex-col min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#98A5BC]">
                  Pickup Location
                </span>
                <input
                  type="text"
                  aria-label="Pickup location"
                  onKeyDown={(event) => { if (event.key === 'Escape') setPickupOpen(false); }}
                  value={pickup}
                  onChange={(e) => {
                    onPickupChange(e.target.value);
                    setPickupOpen(true);
                  }}
                  onFocus={() => setPickupOpen(true)}
                  placeholder="Enter pickup point (e.g. VIT Chennai)"
                  className="w-full bg-transparent text-sm font-semibold text-[#F6F8FC] placeholder:text-[#98A5BC]/50 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setPickupOpen(!pickupOpen)}
                className="text-[#98A5BC] hover:text-[#F6F8FC] p-1"
                aria-label="Toggle pickup suggestions"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            {/* Pickup Suggestions Dropdown */}
            {pickupOpen && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-30 max-h-56 overflow-y-auto rounded-xl bg-[#151F32] border border-[#2A3B54] py-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
                <div className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#98A5BC]/80">
                  Popular Locations
                </div>
                {(filteredPickupSuggestions.length > 0
                  ? filteredPickupSuggestions
                  : availableLocations
                ).map((loc) => {
                  const isSelected = loc.label.toLowerCase() === pickup.toLowerCase();
                  return (
                    <button
                      key={loc.label}
                      type="button"
                      onClick={() => {
                        onPickupChange(loc.label);
                        setPickupOpen(false);
                      }}
                      className={`flex w-full items-center justify-between px-3.5 py-2 text-left text-xs sm:text-sm font-medium transition-colors ${
                        isSelected
                          ? 'bg-[#B9FF45]/15 text-[#B9FF45]'
                          : 'text-[#F6F8FC] hover:bg-[#1E2C44]'
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-[#98A5BC]" />
                        {loc.label}
                      </span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-[#B9FF45]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Vertical Visual Connector between inputs */}
          <div className="flex items-center pl-7 -my-1">
            <div className="h-3.5 w-0.5 border-l-2 border-dashed border-[#B9FF45]/40" />
          </div>

          {/* Destination Block */}
          <div ref={dropoffRef} className="relative">
            <div className="flex items-center gap-3 rounded-xl bg-[#131E31] border border-[#22334D] px-3.5 py-2.5 transition-colors focus-within:border-[#B9FF45] focus-within:ring-1 focus-within:ring-[#B9FF45]/30">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#2ED389]/15 text-[#2ED389]">
                <MapPin className="h-4 w-4" />
              </div>
              <div className="flex flex-1 flex-col min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#98A5BC]">
                  Destination
                </span>
                <input
                  type="text"
                  aria-label="Destination"
                  onKeyDown={(event) => { if (event.key === 'Escape') setDropoffOpen(false); }}
                  value={dropoff}
                  onChange={(e) => {
                    onDropoffChange(e.target.value);
                    setDropoffOpen(true);
                  }}
                  onFocus={() => setDropoffOpen(true)}
                  placeholder="Enter destination (e.g. Chennai Airport)"
                  className="w-full bg-transparent text-sm font-semibold text-[#F6F8FC] placeholder:text-[#98A5BC]/50 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setDropoffOpen(!dropoffOpen)}
                className="text-[#98A5BC] hover:text-[#F6F8FC] p-1"
                aria-label="Toggle destination suggestions"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            {/* Destination Suggestions Dropdown */}
            {dropoffOpen && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-30 max-h-56 overflow-y-auto rounded-xl bg-[#151F32] border border-[#2A3B54] py-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
                <div className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#98A5BC]/80">
                  Popular Destinations
                </div>
                {(filteredDropoffSuggestions.length > 0
                  ? filteredDropoffSuggestions
                  : availableLocations
                ).map((loc) => {
                  const isSelected = loc.label.toLowerCase() === dropoff.toLowerCase();
                  return (
                    <button
                      key={loc.label}
                      type="button"
                      onClick={() => {
                        onDropoffChange(loc.label);
                        setDropoffOpen(false);
                      }}
                      className={`flex w-full items-center justify-between px-3.5 py-2 text-left text-xs sm:text-sm font-medium transition-colors ${
                        isSelected
                          ? 'bg-[#2ED389]/15 text-[#2ED389]'
                          : 'text-[#F6F8FC] hover:bg-[#1E2C44]'
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-[#98A5BC]" />
                        {loc.label}
                      </span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-[#2ED389]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Suggestion Chips */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="text-[11px] font-medium text-[#98A5BC] mr-1">Quick pick:</span>
        {availableLocations.slice(0, 4).map((loc) => (
          <button
            key={loc.label}
            type="button"
            onClick={() => {
              if (!pickup || pickup === loc.label) {
                onPickupChange(loc.label);
              } else {
                onDropoffChange(loc.label);
              }
            }}
            className="rounded-full bg-[#151F32] hover:bg-[#1F2E47] border border-[#243249] hover:border-[#B9FF45]/40 px-2.5 py-0.5 text-[11px] font-medium text-[#98A5BC] hover:text-[#F6F8FC] transition-all"
          >
            {loc.label}
          </button>
        ))}
      </div>

      {error && <p className="text-xs font-semibold text-[#FF6D76] mt-0.5">{error}</p>}
    </div>
  );
}

export default LocationInput;
