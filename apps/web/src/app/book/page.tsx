'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { DEFAULT_PICKUP_WAIT } from '@/lib/pickup';
import { BookingForm } from '@/components/booking/BookingForm';

function BookingContent() {
  const searchParams = useSearchParams();
  const initialPickup = searchParams.get('pickup') || 'VIT Chennai';
  const initialDropoff = searchParams.get('dropoff') || 'Chennai Airport';
  const requestedMinutes = Number(searchParams.get('needIn'));
  const initialNeedIn = Number.isInteger(requestedMinutes) && requestedMinutes >= 5 && requestedMinutes <= 120
    ? requestedMinutes
    : DEFAULT_PICKUP_WAIT;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-10">
      <header className="space-y-2">
        <Link href="/" className="inline-flex min-h-10 items-center gap-2 rounded-lg text-sm font-bold text-[#bdd0e7] hover:text-[#B9FF45] focus-visible:outline-2 focus-visible:outline-[#B9FF45]">
          <ArrowLeft size={17} aria-hidden="true" /> Home
        </Link>
        <h1 className="text-3xl font-black tracking-tight sm:text-5xl">Set up your trip</h1>
        <p className="text-sm leading-relaxed text-[#bdc9db] sm:text-base">
          Tell ReHop where you’re going and how long you can wait. Review its recommendation before booking.
        </p>
      </header>
      <BookingForm
        initialPickup={initialPickup}
        initialDropoff={initialDropoff}
        initialNeedIn={initialNeedIn}
      />
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-sm text-[#98A5BC]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#B9FF45] border-t-transparent" />
          <span>Loading ride booking…</span>
        </div>
      }
    >
      <BookingContent />
    </Suspense>
  );
}
