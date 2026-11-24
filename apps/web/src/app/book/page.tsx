'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { BookingForm } from '@/components/booking/BookingForm';

function BookingContent() {
  const searchParams = useSearchParams();
  const customSearch = searchParams.get('search') === '1';
  const initialPickup = searchParams.get('pickup') ?? (customSearch ? '' : 'VIT Chennai');
  const initialDropoff = searchParams.get('dropoff') ?? (customSearch ? '' : 'Chennai Airport');
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-10 max-sm:gap-3 max-sm:pb-4">
      <header className="space-y-2 max-sm:px-1 max-sm:pt-2">
        <h1 className="text-3xl font-black tracking-tight max-sm:text-[2.125rem] max-sm:leading-[1.02] sm:text-5xl">Set up your trip</h1>
        <p className="text-sm leading-relaxed text-[#475673] sm:text-base">
          Choose your pickup and destination to see your route and recommended ride.
        </p>
      </header>
      <BookingForm
        initialPickup={initialPickup}
        initialDropoff={initialDropoff}
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
      <BookingContent />
    </Suspense>
  );
}
