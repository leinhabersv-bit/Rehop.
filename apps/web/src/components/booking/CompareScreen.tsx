'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  AlertCircle,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { api, ApiError } from '@/lib/api/client';
import type { Journey } from '@/types';
import { recommendRide } from '@/lib/pickup';
import { rememberRide } from '@/lib/recent-rides';
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

  // Booking & modal states
  const [isBooking, setIsBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [hasOtherRide, setHasOtherRide] = useState(false);
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

  const recommended = journey && recommendRide(journey);
  const canBook = journey?.state === 'WAITING_FOR_RIDE' && !journey.booking_uncertain && !journey.active_ride_id;

  const handleConfirmBooking = async () => {
    if (inFlight.current || !journey) return;
    const request = attempt ?? (canBook && recommended ? {
      journeyId: journey.id,
      quoteId: recommended.quote_id,
      version: journey.version,
      key: crypto.randomUUID(),
    } : null);
    if (!request) return;
    inFlight.current = true;
    setBookingError(null);
    setHasOtherRide(false);
    setIsBooking(true);
    const acceptSnapshot = (snapshot: Journey) => {
      if (snapshot?.id !== request.journeyId || typeof snapshot.version !== 'number' ||
          typeof snapshot.booking_uncertain !== 'boolean' || typeof snapshot.state !== 'string' ||
          !Array.isArray(snapshot.quotes)) return false;
      cache.setQueryData(['journey', request.journeyId], snapshot);
      if (hasConfirmedRide(snapshot, request.quoteId)) {
        rememberRide(snapshot.id);
        setConfirmedJourney(snapshot);
        setIsConfirmationOpen(true);
        setPendingAttempt(null);
        return true;
      }
      if (snapshot.booking_uncertain || snapshot.state === 'RECONCILING') {
        rememberRide(snapshot.id);
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
      setHasOtherRide(err instanceof ApiError && err.code === 'ACTIVE_RIDE_EXISTS');
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
      <div className="min-h-screen bg-[#fff9f0] text-[#171b37] px-4 py-8 sm:py-12 flex items-center justify-center">
        <div className="mx-auto max-w-md w-full rounded-3xl bg-[#edf1ff] border border-[#d9dbe7] p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#a42644]/15 text-[#a42644] border border-[#a42644]/30">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-[#171b37] mb-2">
            {queryJourneyId ? 'Could not load this journey' : 'Choose a trip first'}
          </h2>
          <p className="text-sm text-[#475673] mb-6 leading-relaxed">
            {queryJourneyId ? error?.message : 'Choose a pickup and destination to find a ride.'}
          </p>
          {queryJourneyId && <Button onClick={() => refetch()} loading={isFetching} fullWidth className="mb-3">Try again</Button>}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => router.push('/book')}
            className="!bg-[#173ed7] !text-white !rounded-2xl font-black shadow-[0_0_24px_rgba(39,59,119,0.12)] hover:brightness-105"
          >
            Go to Booking Form
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 pb-10 max-sm:space-y-3 max-sm:pb-5">
      <header className="space-y-3">
        <button
          type="button"
          onClick={() => router.push('/book')}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg text-sm font-bold text-[#475673] hover:text-[#171b37] focus-visible:outline-2 focus-visible:outline-[#B9FF45]"
        >
          <ArrowLeft size={17} aria-hidden="true" /> Edit trip
        </button>
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-[#173ed7]">Simulated booking</p>
          <h1 className="text-3xl font-black tracking-tight sm:text-5xl">{canBook ? 'Review your ride' : 'Your ride'}</h1>
        </div>
        {journey && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[#d9dbe7] bg-[#edf1ff] p-3.5 text-sm">
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 font-bold">
              <MapPin size={16} className="shrink-0 text-[#173ed7]" aria-hidden="true" />
              {journey.pickup.label} <span aria-hidden="true">→</span> {journey.dropoff.label}
            </span>
          </div>
        )}
      </header>

      {isLoading && <p role="status" className="rounded-2xl border border-[#d9dbe7] p-5 text-[#475673]">Checking simulated fares and pickup times…</p>}

      {journey && (
        <section aria-labelledby="ride-choice" id="book-recommendation" className="scroll-mt-24 rounded-3xl border border-[#173ed7]/40 bg-white p-5 max-sm:border-[#d9e0f6] max-sm:p-4 max-sm:shadow-[0_8px_24px_#171b370a] sm:p-7">
          {canBook && recommended ? (
            <>
              <h2 id="ride-choice" className="flex items-center gap-2 text-lg font-bold max-sm:text-[#173ed7]">
                <Sparkles size={18} aria-hidden="true" /> Recommended ride
              </h2>
              <dl className="my-4 grid grid-cols-2 divide-x divide-[#415467] border-y border-[#d9dbe7] py-3 max-sm:gap-2 max-sm:divide-x-0 max-sm:border-y-0 max-sm:py-0">
                <div className="max-sm:rounded-2xl max-sm:bg-[#edf1ff] max-sm:p-3">
                  <dt className="text-sm text-[#475673]">Pickup in</dt>
                  <dd className="text-2xl font-black max-sm:text-[#173ed7]">{Math.max(1, Math.ceil(recommended.pickup_eta_sec / 60))} min</dd>
                </div>
                <div className="pl-4 max-sm:rounded-2xl max-sm:bg-[#fff0e3] max-sm:p-3">
                  <dt className="text-sm text-[#475673]">Estimated fare</dt>
                  <dd className="text-2xl font-black">₹{recommended.estimated_fare_inr.toLocaleString('en-IN')}</dd>
                </div>
              </dl>
            </>
          ) : (
            <div className="mb-4">
              <h2 id="ride-choice" className="text-xl font-black">
                {canBook ? 'No recommended ride available' : 'Check your journey status'}
              </h2>
              <p className="mt-1 text-sm text-[#475673]">
                {canBook ? 'Try again to check for a ride.' : 'Open tracking for the latest provider status.'}
              </p>
            </div>
          )}

          {canBook && recommended && journey.policy.auto_rebook_on_confirmed_driver_cancel && journey.policy.max_recovery_attempts > 0 && (
            <p className="mb-3 text-sm text-[#475673]">
              Auto-rebooking is on for confirmed driver cancellations.
            </p>
          )}
          {bookingError && <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-[#d9dbe7]/40 bg-[#edf1ff] p-3 text-sm text-[#475673]">
            <AlertCircle size={17} className="shrink-0" aria-hidden="true" />
            <div>
              <p>{bookingError}</p>
              {hasOtherRide && <Link href="/trips" className="mt-1 inline-block font-bold text-[#173ed7] underline">View your rides</Link>}
            </div>
          </div>}

          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={isBooking}
            loadingText="Confirming simulated ride…"
            disabled={canBook && !attempt && (isFetching || (!!recommended && !!error))}
            onClick={() => {
              if (attempt || (canBook && recommended)) void handleConfirmBooking();
              else if (canBook) void refetch();
              else router.push(`/journey/${journey.id}`);
            }}
            rightIcon={<ArrowRight size={18} aria-hidden="true" />}
          >
            {attempt ? (retryReady ? 'Retry original request' : 'Check booking status') : !canBook ? 'Open journey tracking' : recommended ? 'Book' : 'Try again'}
          </Button>
        </section>
      )}

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
