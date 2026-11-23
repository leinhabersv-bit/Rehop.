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

type FilterTab = 'all' | 'fastest' | 'cheapest';

export function CompareScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Resolve target journey ID
  const queryJourneyId = searchParams.get('journey');

  // Fetch journey data
  const {
    data: journey,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<Journey>({
    queryKey: ['journey', queryJourneyId],
    queryFn: async () => {
      if (!queryJourneyId) {
        throw new Error('No active simulated journey found. Please start by choosing your pickup and destination.');
      }
      return await api.journey(queryJourneyId);
    },
    enabled: !!queryJourneyId,
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
    if (isBooking) return; // Guard against double-clicks
    const quoteIdToBook = overrideQuoteId || selectedQuoteId || quotes[0]?.quote_id;
    if (!journey || !quoteIdToBook) return;

    setBookingError(null);
    setIsBooking(true);

    try {
      const updatedJourney = await api.book(journey.id, quoteIdToBook, journey.version);
      setConfirmedJourney(updatedJourney);
      setIsConfirmationOpen(true);
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Booking request failed');
    } finally {
      setIsBooking(false);
    }
  };

  // Early return for missing journey ID or failed load
  if (!queryJourneyId || (!isLoading && (isError || !journey))) {
    return (
      <div className="min-h-screen bg-[#090F1D] text-[#F6F8FC] px-4 py-8 sm:py-12 flex items-center justify-center">
        <div className="mx-auto max-w-md w-full rounded-3xl bg-[#0E1624] border border-slate-800 p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FF6D76]/15 text-[#FF6D76] border border-[#FF6D76]/30">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            No active simulated journey found
          </h2>
          <p className="text-sm text-[#98A5BC] mb-6 leading-relaxed">
            No active simulated journey found. Please start by choosing your pickup and destination.
          </p>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => router.push('/book')}
            className="!bg-[#B9FF45] !text-[#090F1D] !rounded-2xl font-black shadow-[0_0_24px_rgba(185,255,69,0.3)] hover:brightness-105"
          >
            Go to Booking Form
          </Button>
          <p className="mt-4 text-xs text-slate-500">
            All providers (Provider A-D) and fares are synthetic.
          </p>
        </div>
      </div>
    );
  }

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
            Prices and ETAs shown are simulated. Ranked for your budget and deadline. All providers (Provider A-D) and fares are synthetic.
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
                  Pickup deadline: <strong className="text-white">{formatDeadline(journey.need_by)}</strong> (simulated)
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
              Prices and ETAs shown are simulated. All providers (Provider A-D) and fares are synthetic.
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
