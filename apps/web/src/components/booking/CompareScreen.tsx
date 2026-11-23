'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Sparkles,
  RefreshCw,
  AlertCircle,
  MapPin,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { api } from '@/lib/api/client';
import type { Journey, Quote } from '@/types';
import { providerName } from '@/types';
import { ProviderCard } from './ProviderCard';
import { BookingConfirmationModal } from './BookingConfirmationModal';

export const FALLBACK_MOCK_JOURNEY: Journey = {
  id: 'sim-fallback-demo',
  pickup: { label: 'VIT Chennai', lat: 12.8406, lng: 80.1534 },
  dropoff: { label: 'Chennai Airport', lat: 12.9941, lng: 80.1709 },
  state: 'OFFERED',
  version: 1,
  active_ride_id: null,
  active_ride: null,
  last_ride: null,
  quotes: [
    {
      quote_id: 'q-demo-a',
      provider: 'PROVIDER_A',
      estimated_fare_inr: 890,
      pickup_eta_sec: 240, // 4 min
      expires_at: new Date(Date.now() + 540000).toISOString(),
      is_simulated: true,
    },
    {
      quote_id: 'q-demo-b',
      provider: 'PROVIDER_B',
      estimated_fare_inr: 820,
      pickup_eta_sec: 360, // 6 min
      expires_at: new Date(Date.now() + 540000).toISOString(),
      is_simulated: true,
    },
    {
      quote_id: 'q-demo-c',
      provider: 'PROVIDER_C',
      estimated_fare_inr: 1050,
      pickup_eta_sec: 300, // 5 min
      expires_at: new Date(Date.now() + 540000).toISOString(),
      is_simulated: true,
    },
    {
      quote_id: 'q-demo-d',
      provider: 'PROVIDER_D',
      estimated_fare_inr: 960,
      pickup_eta_sec: 480, // 8 min
      expires_at: new Date(Date.now() + 540000).toISOString(),
      is_simulated: true,
    },
  ],
  risk: null,
  pending_backup: null,
  recovery_attempts: 0,
  policy: {
    auto_rebook_on_confirmed_driver_cancel: true,
    max_total_fare_inr: 1200,
    max_recovery_attempts: 2,
    preemptive_switch_requires_approval: true,
    allow_same_provider_retry: true,
    max_cancellation_fee_inr: 100,
  },
  scenario: 'S01',
  simulated_time: new Date().toISOString(),
  is_simulated: true,
  booking_uncertain: false,
  last_event_seq: 0,
  need_by: new Date(Date.now() + 25 * 60000).toISOString(),
  driver_chat_signal: null,
  deadline_decision: null,
  cancellation_fee_notice: null,
};

type FilterTab = 'all' | 'fastest' | 'cheapest';

export function CompareScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Resolve target journey ID
  const queryJourneyId = searchParams.get('journey');

  const [resolvedJourneyId, setResolvedJourneyId] = useState<string>(() => {
    if (queryJourneyId) return queryJourneyId;
    if (typeof window !== 'undefined') {
      const last = sessionStorage.getItem('last_simulated_journey');
      if (last) {
        try {
          const parsed = JSON.parse(last) as Journey;
          if (parsed?.id) return parsed.id;
        } catch {}
      }
    }
    return 'sim-fallback-demo';
  });

  useEffect(() => {
    if (queryJourneyId) {
      setResolvedJourneyId(queryJourneyId);
    } else if (typeof window !== 'undefined') {
      const last = sessionStorage.getItem('last_simulated_journey');
      if (last) {
        try {
          const parsed = JSON.parse(last) as Journey;
          if (parsed?.id) setResolvedJourneyId(parsed.id);
        } catch {}
      }
    }
  }, [queryJourneyId]);

  // Fetch journey data
  const {
    data: journey,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<Journey>({
    queryKey: ['journey', resolvedJourneyId],
    queryFn: async () => {
      if (resolvedJourneyId === 'sim-fallback-demo') {
        if (typeof window !== 'undefined') {
          const stored = sessionStorage.getItem(`journey_${resolvedJourneyId}`);
          if (stored) {
            try {
              return JSON.parse(stored) as Journey;
            } catch {}
          }
        }
        return FALLBACK_MOCK_JOURNEY;
      }

      try {
        return await api.journey(resolvedJourneyId);
      } catch {
        if (typeof window !== 'undefined') {
          const stored =
            sessionStorage.getItem(`journey_${resolvedJourneyId}`) ||
            sessionStorage.getItem('last_simulated_journey');
          if (stored) {
            try {
              return JSON.parse(stored) as Journey;
            } catch {}
          }
        }
        return FALLBACK_MOCK_JOURNEY;
      }
    },
    staleTime: 30000,
    retry: 1,
  });

  // Filter tab state
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  // Selected quote state
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);

  // Booking & modal states
  const [isBooking, setIsBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [confirmedJourney, setConfirmedJourney] = useState<Journey | null>(null);

  // Auto-refresh countdown timer (seconds)
  const [refreshCountdown, setRefreshCountdown] = useState<number>(45);

  useEffect(() => {
    const timer = setInterval(() => {
      setRefreshCountdown((prev) => {
        if (prev <= 1) {
          refetch();
          return 45;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [refetch]);

  // Sync selected quote once journey loads
  useEffect(() => {
    if (journey?.quotes && journey.quotes.length > 0 && !selectedQuoteId) {
      setSelectedQuoteId(journey.quotes[0].quote_id);
    }
  }, [journey, selectedQuoteId]);

  // Compute sorted & filtered quotes
  const quotes = useMemo(() => journey?.quotes || [], [journey?.quotes]);

  const lowestFare = useMemo(() => {
    if (!quotes.length) return 0;
    return Math.min(...quotes.map((q) => q.estimated_fare_inr));
  }, [quotes]);

  const lowestEta = useMemo(() => {
    if (!quotes.length) return 0;
    return Math.min(...quotes.map((q) => q.pickup_eta_sec));
  }, [quotes]);

  const displayedQuotes = useMemo(() => {
    const list = [...quotes];
    if (activeTab === 'fastest') {
      return list.sort((a, b) => a.pickup_eta_sec - b.pickup_eta_sec);
    }
    if (activeTab === 'cheapest') {
      return list.sort((a, b) => a.estimated_fare_inr - b.estimated_fare_inr);
    }
    return list;
  }, [quotes, activeTab]);

  // Determine tag for each quote
  const getQuoteTag = (quote: Quote, index: number) => {
    if (quote.estimated_fare_inr === lowestFare) return 'Lowest Fare';
    if (quote.pickup_eta_sec === lowestEta) return 'Fastest Pickup';
    if (index === 0) return 'Best Fit';
    return 'Available';
  };

  const selectedQuote = quotes.find((q) => q.quote_id === selectedQuoteId) || quotes[0];
  const selectedProviderName = selectedQuote
    ? providerName[selectedQuote.provider] || selectedQuote.provider
    : 'Provider A';

  const formatDeadline = (isoString?: string) => {
    if (!isoString) return '7:00 PM';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
      return '7:00 PM';
    }
  };

  // Execute Booking
  const handleConfirmBooking = async (overrideQuoteId?: string) => {
    const quoteIdToBook = overrideQuoteId || selectedQuoteId || quotes[0]?.quote_id;
    if (!journey || !quoteIdToBook) return;

    setBookingError(null);
    setIsBooking(true);

    try {
      const updatedJourney = await api.book(journey.id, quoteIdToBook);
      setConfirmedJourney(updatedJourney);
      setIsConfirmationOpen(true);
    } catch {
      // Local fallback simulation if backend offline
      const q = quotes.find((item) => item.quote_id === quoteIdToBook) || quotes[0];
      const localSimulated: Journey = {
        ...journey,
        state: 'BOOKED',
        active_ride_id: quoteIdToBook,
        active_ride: {
          ride_id: `ride_${quoteIdToBook}`,
          journey_id: journey.id,
          provider: q.provider,
          quote_id: quoteIdToBook,
          state: 'DRIVER_ASSIGNED',
          booked_at: new Date().toISOString(),
          driver_id: 'DRV_SIM_01',
          distance_to_pickup_m: 850,
          eta_sec: q.pickup_eta_sec,
          last_position_at: new Date().toISOString(),
          is_simulated: true,
        },
      };

      if (typeof window !== 'undefined') {
        sessionStorage.setItem(`journey_${journey.id}`, JSON.stringify(localSimulated));
        sessionStorage.setItem('last_simulated_journey', JSON.stringify(localSimulated));
      }

      setConfirmedJourney(localSimulated);
      setIsConfirmationOpen(true);
    } finally {
      setIsBooking(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090F1D] text-[#F6F8FC] px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        {/* Navigation Top Bar */}
        <div className="flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={() => router.push('/book')}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800/60 border border-white/10 text-slate-300 hover:text-white transition-colors"
            aria-label="Back to booking"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <span className="inline-flex items-center gap-1 rounded-full bg-[#132D21] px-3.5 py-1 text-xs font-mono font-bold tracking-wider uppercase text-[#B9FF45] border border-[#1F4A35]">
            COMPARISON · 03 / 03
          </span>
        </div>

        {/* Hero Header */}
        <div className="mb-6">
          <div className="text-xs font-bold tracking-widest text-[#B9FF45] uppercase mb-1">
            Step 2 of 3 · Compare
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
            Available rides<span className="text-[#B9FF45]">.</span>
          </h1>
          <p className="mt-2 text-sm text-[#98A5BC]">
            Prices and ETAs shown are simulated. Ranked for your budget and deadline.
          </p>

          {/* Trip Summary Pill */}
          {journey && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#101726] border border-[#1E293B] px-4 py-3 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <MapPin className="h-3.5 w-3.5 text-[#B9FF45] shrink-0" />
                <span className="font-semibold text-white">{journey.pickup.label}</span>
                <span className="text-slate-500">→</span>
                <span className="font-semibold text-white">{journey.dropoff.label}</span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-400">
                  Deadline: <strong className="text-white">{formatDeadline(journey.need_by)}</strong>
                </span>
              </div>

              <button
                type="button"
                onClick={() => router.push('/book')}
                className="font-bold text-[#B9FF45] hover:underline"
              >
                Change trip
              </button>
            </div>
          )}
        </div>

        {/* Quote Refresh Bar */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-[#B9FF45]" />
            <span>
              Quotes expire in <strong className="text-white">{refreshCountdown}s</strong> · Auto-refreshing
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              setRefreshCountdown(45);
              refetch();
            }}
            disabled={isFetching}
            className="inline-flex items-center gap-1 font-semibold text-slate-300 hover:text-white"
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin text-[#B9FF45]' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Sorting & Filter Tabs */}
        <div className="mb-5 flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`
              inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all
              ${
                activeTab === 'all'
                  ? 'bg-[#14291E] border border-[#265339] text-[#B9FF45]'
                  : 'bg-[#151C28] border border-[#233044] text-slate-300 hover:text-white'
              }
            `}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>All ({quotes.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('fastest')}
            className={`
              inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all
              ${
                activeTab === 'fastest'
                  ? 'bg-[#14291E] border border-[#265339] text-[#B9FF45]'
                  : 'bg-[#151C28] border border-[#233044] text-slate-300 hover:text-white'
              }
            `}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Fastest ETA</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cheapest')}
            className={`
              inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all
              ${
                activeTab === 'cheapest'
                  ? 'bg-[#14291E] border border-[#265339] text-[#B9FF45]'
                  : 'bg-[#151C28] border border-[#233044] text-slate-300 hover:text-white'
              }
            `}
          >
            <span>₹</span>
            <span>Lowest Price</span>
          </button>
        </div>

        {/* Main Quotes Content & States */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-28 rounded-2xl bg-[#0F1726] border border-[#1E293B] p-5 animate-pulse flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-xl bg-slate-800" />
                  <div className="space-y-2">
                    <div className="h-4 w-28 rounded bg-slate-800" />
                    <div className="h-3 w-40 rounded bg-slate-800/60" />
                  </div>
                </div>
                <div className="h-6 w-16 rounded bg-slate-800" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-2xl bg-[#FF6D76]/10 border border-[#FF6D76]/25 p-6 text-center text-sm">
            <AlertCircle className="mx-auto h-8 w-8 text-[#FF6D76] mb-2" />
            <div className="font-bold text-white text-base">Could not retrieve quotes</div>
            <p className="text-slate-400 mt-1 max-w-sm mx-auto">
              {error instanceof Error ? error.message : 'Please check connection or retry'}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="mt-4"
              leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              Retry
            </Button>
          </div>
        ) : displayedQuotes.length === 0 ? (
          <div className="rounded-2xl bg-[#0F1726] border border-slate-800 p-8 text-center text-sm">
            <SlidersHorizontal className="mx-auto h-8 w-8 text-slate-500 mb-2" />
            <div className="font-bold text-white text-base">
              No simulated quotes found matching criteria
            </div>
            <p className="text-slate-400 mt-1">
              Try adjusting your max fare limit or destination to find available rides.
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => router.push('/book')}
              className="mt-4"
            >
              Adjust Trip Filters
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {displayedQuotes.map((quote, index) => (
              <ProviderCard
                key={quote.quote_id}
                quote={quote}
                isSelected={selectedQuoteId === quote.quote_id}
                onSelect={(id) => {
                  setSelectedQuoteId(id);
                }}
                maxFare={journey?.policy?.max_total_fare_inr}
                isBooking={isBooking && selectedQuoteId === quote.quote_id}
                tag={getQuoteTag(quote, index)}
              />
            ))}
          </div>
        )}

        {/* Booking Error Banner */}
        {bookingError && (
          <div className="mt-4 rounded-xl bg-[#FF6D76]/15 border border-[#FF6D76]/30 p-3 text-xs text-[#FF6D76] flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{bookingError}</span>
          </div>
        )}

        {/* Bottom Sticky Action Card */}
        {journey && displayedQuotes.length > 0 && (
          <div className="mt-8 rounded-2xl bg-[#0E1624] border border-slate-800 p-4 sm:p-5 shadow-2xl">
            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={isBooking}
              loadingText="Confirming simulated ride..."
              onClick={() => handleConfirmBooking()}
              rightIcon={<ArrowRight className="h-5 w-5" />}
              className="!rounded-2xl shadow-[0_0_24px_rgba(185,255,69,0.3)] hover:brightness-105"
            >
              Continue with {selectedProviderName}
            </Button>

            <p className="mt-3 text-center text-xs text-slate-500">
              Prices and ETAs shown are simulated.
            </p>
          </div>
        )}
      </div>

      {/* Screen 4: Booking Confirmation Modal */}
      {journey && (
        <BookingConfirmationModal
          isOpen={isConfirmationOpen}
          onClose={() => setIsConfirmationOpen(false)}
          journey={confirmedJourney || journey}
          selectedQuote={selectedQuote}
          onTrackRide={(id) => router.push(`/journey/${id}`)}
        />
      )}
    </div>
  );
}

export default CompareScreen;
