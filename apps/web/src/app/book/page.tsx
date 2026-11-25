'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { BookingForm } from '@/components/booking/BookingForm';
import { api } from '@/lib/api/client';

function TripSetup() {
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  const previous = useQuery({
    queryKey: ['journey', editId],
    queryFn: () => api.journey(editId!),
    enabled: !!editId,
    staleTime: 30_000,
  });
  const customSearch = searchParams.get('search') === '1';
  if (editId && previous.isPending) return <p role="status">Loading trip details…</p>;
  if (editId && !previous.data) return <p role="alert">Trip details are unavailable. <Link href="/book" className="underline">Plan a new trip</Link></p>;
  const initialPickup = previous.data?.pickup ?? searchParams.get('pickup') ?? (customSearch ? '' : 'VIT Chennai');
  const initialDropoff = previous.data?.dropoff ?? searchParams.get('dropoff') ?? (customSearch ? '' : 'Chennai Airport');
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-10 max-sm:gap-3 max-sm:pb-4">
      <header className="space-y-2 max-sm:px-1 max-sm:pt-2">
        <p className="text-xs font-bold text-[#173ed7]">Step 1 of 2 · Trip details</p>
        <h1 className="text-3xl font-black tracking-tight max-sm:text-[2.125rem] max-sm:leading-[1.02] sm:text-5xl">Set up your trip</h1>
        <p className="text-sm leading-relaxed text-[#475673] sm:text-base">
          Choose your pickup and destination to see your route and recommended ride.
        </p>
      </header>
      <BookingForm
        key={editId ?? searchParams.toString()}
        initialPickup={initialPickup}
        initialDropoff={initialDropoff}
        initialMaxFare={previous.data?.policy.max_total_fare_inr}
        initialAutoRebook={previous.data?.state === 'WAITING_FOR_RIDE' && previous.data.policy.auto_rebook_on_confirmed_driver_cancel}
      />
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-sm text-[#475673]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#173ed7] border-t-transparent" />
          <span>Loading ride booking…</span>
        </div>
      }
    >
      <TripSetup />
    </Suspense>
  );
}
