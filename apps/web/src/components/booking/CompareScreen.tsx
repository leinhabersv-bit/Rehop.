'use client';

import React, { useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  RefreshCw,
  AlertCircle,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { api, ApiError } from '@/lib/api/client';
import type { Journey, Quote } from '@/types';
import { providerName } from '@/types';
import { recommendRide } from '@/lib/pickup';
import { ProviderCard, isQuoteWithinPolicy } from './ProviderCard';
import { BookingConfirmationModal, hasConfirmedRide } from './BookingConfirmationModal';

export function CompareScreen() {
  const router = useRouter();
  const cache = useQueryClient();
  const searchParams = useSearchParams();

  // Resolve target journey ID
  const queryJourneyId = searchParams.get('journey');

  // Fetch journey data
  const {
    data: journey,
    isLoading,
    error,
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

  const [showAlternatives, setShowAlternatives] = useState(false);

  // Selected quote state
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);

  // Booking & modal states
  const [isBooking, setIsBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [confirmedJourney, setConfirmedJourney] = useState<Journey | null>(null);

  const inFlight = useRef(false);
  const [retryReady, setRetryReady] = useState(false);
  const [pendingAttempt, setPendingAttempt] = useState<{
    journeyId: string;
    quoteId: string;
    version: number;
    key: string;
    providerUncertain?: boolean;
  } | null>(null);
  const attempt = pendingAttempt?.journeyId === queryJourneyId ? pendingAttempt : null;

  const quotes = journey?.quotes ?? [];
  const recommended = journey && recommendRide(journey);
  const displayedQuotes = [...quotes].sort((a, b) => a.estimated_fare_inr - b.estimated_fare_inr);
  const simulatedTimeMs = Date.parse(journey?.simulated_time ?? '');
  const deadlineMs = Date.parse(journey?.need_by ?? '');
  const canBook = journey?.state === 'WAITING_FOR_RIDE' && !journey.booking_uncertain && !journey.active_ride_id;
  const isEligible = (quote: Quote) =>
    journey && Date.parse(quote.expires_at) > simulatedTimeMs &&
    isQuoteWithinPolicy(quote, journey.policy);
  const selectedQuote = quotes.find((quote) => quote.quote_id === selectedQuoteId && isEligible(quote))
    ?? recommended;
  const selectedProviderName = selectedQuote ? providerName[selectedQuote.provider] : null;
  const chosenRecommendation = selectedQuote?.quote_id === recommended?.quote_id;
  const selectedMeetsDeadline = selectedQuote && simulatedTimeMs + selectedQuote.pickup_eta_sec * 1000 <= deadlineMs;
  const maxWaitMinutes = Math.max(0, Math.round((deadlineMs - simulatedTimeMs) / 60_000));

  const handleConfirmBooking = async () => {
    if (inFlight.current || !journey || (!attempt && (!canBook || !selectedQuote))) return;
    const request = attempt ?? {
      journeyId: journey.id,
      quoteId: selectedQuote!.quote_id,
      version: journey.version,
      key: crypto.randomUUID(),
    };
    inFlight.current = true;
    setBookingError(null);
    setIsBooking(true);
    const acceptSnapshot = (snapshot: Journey) => {
      if (snapshot?.id !== request.journeyId || typeof snapshot.version !== 'number' ||
          typeof snapshot.booking_uncertain !== 'boolean' || typeof snapshot.state !== 'string' ||
          !Array.isArray(snapshot.quotes)) return false;
      cache.setQueryData(['journey', request.journeyId], snapshot);
      if (hasConfirmedRide(snapshot, request.quoteId)) {
        setConfirmedJourney(snapshot);
        setIsConfirmationOpen(true);
        setPendingAttempt(null);
        return true;
      }
      if (snapshot.booking_uncertain || snapshot.state === 'RECONCILING') {
        setBookingError('The provider has yet to confirm the booking. Open tracking to check its status.');
        setPendingAttempt(null);
        return true;
      }
      if (snapshot.state !== 'WAITING_FOR_RIDE' || snapshot.active_ride_id) {
        setBookingError('The journey changed. Open tracking for the current ride status.');
        setPendingAttempt(null);
        return true;
      }
      return false;
    };

    try {
      if (attempt) {
        const latest = await api.journey(request.journeyId);
        if (acceptSnapshot(latest)) return;
        if (request.providerUncertain) {
          setBookingError('The provider has yet to confirm the original request. Check again later.');
          return;
        }
        if (!retryReady) {
          setRetryReady(true);
          setBookingError('No booking is confirmed. You can retry the original request.');
          return;
        }
      }
      setRetryReady(false);
      const updated = await api.book(request.journeyId, request.quoteId, request.version, request.key);
      if (acceptSnapshot(updated)) return;
      setPendingAttempt(request);
      setBookingError('The booking outcome is unknown. Check status before continuing.');
    } catch (err) {
      const ambiguous = !(err instanceof ApiError) || !err.status || err.status === 408 || err.status >= 500;
      const providerUncertain = request.providerUncertain ||
        (err instanceof ApiError && err.code === 'BOOKING_UNCONFIRMED');
      setRetryReady(false);
      setPendingAttempt(ambiguous || providerUncertain ? { ...request, providerUncertain } : null);
      setBookingError(ambiguous || providerUncertain
        ? 'The booking outcome is unknown. Check status before continuing.'
        : err.message);
      try {
        acceptSnapshot(await api.journey(request.journeyId));
      } catch {
        // Retain the original request so any transport retry uses the same idempotency key.
      }
    } finally {
      inFlight.current = false;
      setIsBooking(false);
    }
  };

  // Early return for missing journey ID or failed load
  if (!queryJourneyId || (!isLoading && !journey)) {
    return (
      <div className="min-h-screen bg-[#090F1D] text-[#F6F8FC] px-4 py-8 sm:py-12 flex items-center justify-center">
        <div className="mx-auto max-w-md w-full rounded-3xl bg-[#0E1624] border border-slate-800 p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FF6D76]/15 text-[#FF6D76] border border-[#FF6D76]/30">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            {queryJourneyId ? 'Could not load this journey' : 'Choose a trip first'}
          </h2>
          <p className="text-sm text-[#98A5BC] mb-6 leading-relaxed">
            {queryJourneyId ? error?.message : 'Choose a pickup and destination to compare simulated rides.'}
          </p>
          {queryJourneyId && <Button onClick={() => refetch()} loading={isFetching} fullWidth className="mb-3">Try again</Button>}
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

  const alternativesVisible = showAlternatives || (!recommended && !!quotes.length);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 pb-10">
      <header className="space-y-3">
        <button
          type="button"
          onClick={() => router.push('/book')}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg text-sm font-bold text-[#bdd0e7] hover:text-white focus-visible:outline-2 focus-visible:outline-[#B9FF45]"
        >
          <ArrowLeft size={17} aria-hidden="true" /> Edit trip
        </button>
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-[#B9FF45]">Simulated booking</p>
          <h1 className="text-3xl font-black tracking-tight sm:text-5xl">{canBook ? 'Review your ride' : 'Your ride'}</h1>
        </div>
        {journey && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[#304055] bg-[#111c2e] p-3.5 text-sm">
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 font-bold">
              <MapPin size={16} className="shrink-0 text-[#B9FF45]" aria-hidden="true" />
              {journey.pickup.label} <span aria-hidden="true">→</span> {journey.dropoff.label}
            </span>
            <span className="text-[#bdc9db]">Max wait <strong className="text-white">{maxWaitMinutes} min</strong></span>
            <span className="text-[#bdc9db]">Fare cap <strong className="text-white">₹{journey.policy.max_total_fare_inr}</strong></span>
          </div>
        )}
      </header>

      {isLoading && <p role="status" className="rounded-2xl border border-[#304055] p-5 text-[#bdc9db]">Checking simulated fares and pickup times…</p>}

      {journey && (
        <section aria-labelledby="ride-choice" id="book-recommendation" className="scroll-mt-24 rounded-3xl border border-[#B9FF45]/40 bg-gradient-to-br from-[#1b2e2b] via-[#131f2f] to-[#101827] p-5 sm:p-7">
          {canBook && selectedQuote ? (
            <>
              <p className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-[#d8ffa1]">
                <Sparkles size={17} aria-hidden="true" /> {chosenRecommendation ? 'ReHop recommends' : 'Your selection'}
              </p>
              <h2 id="ride-choice" className="text-2xl font-black tracking-tight sm:text-4xl">{selectedProviderName}</h2>
              <dl className="my-4 grid grid-cols-2 divide-x divide-[#415467] border-y border-[#415467] py-3">
                <div>
                  <dt className="text-sm text-[#c0cede]">Estimated pickup</dt>
                  <dd className="text-2xl font-black">{Math.ceil(selectedQuote.pickup_eta_sec / 60)} min</dd>
                </div>
                <div className="pl-4">
                  <dt className="text-sm text-[#c0cede]">Estimated fare</dt>
                  <dd className="text-2xl font-black">₹{selectedQuote.estimated_fare_inr}</dd>
                </div>
              </dl>
              <p className={selectedMeetsDeadline ? 'mb-5 text-sm text-[#d4e3d9]' : 'mb-5 text-sm font-bold text-[#ffcb92]'}>
                {chosenRecommendation
                  ? 'Lowest fare among available rides that meet your maximum wait and fare cap.'
                  : selectedMeetsDeadline ? 'This ride fits your maximum wait and fare cap.' : 'This pickup is estimated to exceed your maximum wait.'}
              </p>
            </>
          ) : (
            <div className="mb-4">
              <h2 id="ride-choice" className="text-xl font-black">
                {canBook ? 'No ride meets both limits' : 'Check your journey status'}
              </h2>
              <p className="mt-1 text-sm text-[#bdc9db]">
                {canBook ? 'Adjust your trip limits or review any available alternatives below.' : 'Open tracking for the latest provider status.'}
              </p>
            </div>
          )}

          {bookingError && <p role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-[#FF9CA1]/40 bg-[#351d2b] p-3 text-sm text-[#ffc8cc]"><AlertCircle size={17} className="shrink-0" aria-hidden="true" />{bookingError}</p>}

          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={isBooking}
            loadingText="Confirming simulated ride…"
            disabled={canBook && !attempt && (!selectedQuote || isFetching || !!error)}
            onClick={() => {
              if (canBook || attempt) void handleConfirmBooking();
              else router.push(`/journey/${journey.id}`);
            }}
            rightIcon={<ArrowRight size={18} aria-hidden="true" />}
          >
            {attempt ? (retryReady ? 'Retry original request' : 'Check booking status') : !canBook ? 'Open journey tracking' : selectedProviderName ? `Book with ${selectedProviderName}` : 'No eligible ride selected'}
          </Button>
        </section>
      )}

      {canBook && !!quotes.length && (
        <section aria-labelledby="compare-rides" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="compare-rides" className="text-base font-bold">Provider quotes</h2>
            <button
              type="button"
              aria-expanded={alternativesVisible}
              aria-controls="ride-quotes"
              onClick={() => setShowAlternatives(!alternativesVisible)}
              disabled={!recommended}
              className="min-h-10 rounded-lg border border-[#34445a] px-3 text-sm font-bold text-[#dce8f7] hover:border-[#B9FF45] focus-visible:outline-2 focus-visible:outline-[#B9FF45]"
            >
              {alternativesVisible ? 'Hide provider quotes' : `Compare all ${quotes.length} rides`}
            </button>
          </div>
          {alternativesVisible && (
            <>
              <div id="ride-quotes" role="radiogroup" aria-label="Simulated ride quotes" className="grid gap-3 sm:grid-cols-2">
                {displayedQuotes.map((quote) => (
                  <ProviderCard
                    key={quote.quote_id}
                    quote={quote}
                    isSelected={selectedQuote?.quote_id === quote.quote_id}
                    onSelect={setSelectedQuoteId}
                    maxFare={journey?.policy.max_total_fare_inr}
                    isBooking={isBooking || !!attempt}
                    simulatedTimeMs={simulatedTimeMs}
                    deadlineMs={deadlineMs}
                    tag={recommended?.quote_id === quote.quote_id ? 'Recommended' : undefined}
                  />
                ))}
              </div>
              <a href="#book-recommendation" className="inline-block py-2 text-sm font-bold text-[#B9FF45] underline underline-offset-4">Review selected ride ↑</a>
            </>
          )}
        </section>
      )}

      {journey && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#304055] pt-3 text-sm text-[#bac7da]">
        <span>Quotes and pickup ETAs are simulated.</span>
        <button type="button" onClick={() => void refetch()} disabled={isFetching} className="inline-flex min-h-10 items-center gap-2 rounded-lg font-bold hover:text-white focus-visible:outline-2 focus-visible:outline-[#B9FF45]">
          <RefreshCw size={15} aria-hidden="true" /> Check latest status
        </button>
      </div>}

      {confirmedJourney && (
        <BookingConfirmationModal
          isOpen={isConfirmationOpen}
          onClose={() => setIsConfirmationOpen(false)}
          journey={confirmedJourney}
          onTrackRide={(id) => router.push(`/journey/${id}`)}
        />
      )}
    </div>
  );
}

export default CompareScreen;
