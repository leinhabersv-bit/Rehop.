'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Compass } from 'lucide-react';
import { Badge } from '@/components/ui';
import { BookingForm } from '@/components/booking/BookingForm';

function BookingContent() {
  const searchParams = useSearchParams();
  const initialPickup = searchParams.get('pickup') || 'VIT Chennai';
  const initialDropoff = searchParams.get('dropoff') || 'Chennai Airport';
  const requestedMinutes = Number(searchParams.get('needIn'));
  const initialNeedIn = Number.isInteger(requestedMinutes) && requestedMinutes >= 5 && requestedMinutes <= 120
    ? requestedMinutes
    : 20;

  return (
    <div className="flex flex-col gap-8 pb-16">
      {/* Top Navigation / Breadcrumbs & Progress */}
      <div className="flex items-center justify-between gap-4 border-b border-[#243249]/60 pb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-bold text-[#98A5BC] hover:text-[#B9FF45] transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          <span>Back to Home</span>
        </Link>

        {/* Step Indicator */}
        <div className="flex items-center gap-2.5">
          <Badge
            variant="primary"
            size="sm"
            className="font-extrabold uppercase tracking-widest text-[10px] px-2.5 py-0.5"
          >
            Step 1 of 3: Trip Setup
          </Badge>
          <div className="hidden sm:flex items-center gap-1.5">
            <span className="h-2 w-5 rounded-full bg-[#B9FF45]" />
            <span className="h-2 w-2 rounded-full bg-[#243249]" />
            <span className="h-2 w-2 rounded-full bg-[#243249]" />
          </div>
        </div>
      </div>

      {/* Screen 2 Header / Hero Copy */}
      <div className="flex flex-col gap-2 max-w-3xl mx-auto w-full text-center sm:text-left">
        <div className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-[#B9FF45]">
          <Compass className="h-3.5 w-3.5" />
          <span>Let&apos;s get moving</span>
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-[#F6F8FC] leading-tight">
          Where to?
        </h1>

        <p className="text-sm sm:text-base font-semibold text-[#98A5BC] max-w-2xl">
          Tell us what you need. We&apos;ll find the right ride and watch your pickup.
        </p>
      </div>

      {/* Main Booking Form */}
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
