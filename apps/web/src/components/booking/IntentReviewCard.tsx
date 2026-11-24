'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  ArrowRight,
  Edit3,
  MapPin,
  RotateCcw,
} from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import type { Location } from '@/types';
import type { ParsedIntentResult } from './AiRequestInput';

export interface IntentReviewCardProps {
  intent: ParsedIntentResult;
  locations: Location[];
  onConfirmAndFind: (confirmedValues: {
    pickup: string;
    dropoff: string;
  }) => void;
  onEditManually: () => void;
  className?: string;
}



export function IntentReviewCard({
  intent,
  locations,
  onConfirmAndFind,
  onEditManually,
  className = '',
}: IntentReviewCardProps) {
  // Editable fields within the review card
  const [pickup, setPickup] = useState(intent.pickup ?? '');
  const [dropoff, setDropoff] = useState(intent.dropoff ?? '');
  const [isEditing, setIsEditing] = useState(!intent.pickup || !intent.dropoff);
  const fieldsCount = [intent.pickup, intent.dropoff].filter(Boolean).length;
  const validRoute = pickup !== dropoff && locations.some((item) => item.label === pickup)
    && locations.some((item) => item.label === dropoff);

  const handleConfirm = () => {
    onConfirmAndFind({
      pickup,
      dropoff,
    });
  };

  return (
    <div
      className={`relative rounded-3xl bg-[#edf1ff] border border-[#d9dbe7] p-6 sm:p-7 shadow-[0_12px_48px_rgba(39,59,119,0.12)] ${className}`}
    >
      {/* Top Header / Eyebrow */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Badge
            variant="ai"
            size="md"
            dot
            className="!bg-[#5135ab]/15 !text-[#5135ab] !border-[#5135ab]/40 font-extrabold uppercase tracking-wider text-[11px]"
          >
            Request review
          </Badge>
          <span className="text-xs font-semibold text-[#475673]">
            {intent.source === 'llm' ? 'AI interpretation' : 'Rule-based interpretation'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsEditing(!isEditing)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#173ed7] hover:underline hover:brightness-110 transition-colors"
        >
          <Edit3 className="h-3.5 w-3.5" />
          {isEditing ? 'Done editing' : 'Quick edit'}
        </button>
      </div>

      {/* Main Heading */}
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[#171b37]">
          Review your ride request
        </h2>
        <p className="text-sm font-medium text-[#475673] mt-1">
          Check the pickup and destination before continuing.
        </p>
      </div>

      {/* 1. Original User Request Quote Box */}
      {intent.original_text && (
        <div className="rounded-2xl bg-[#edf1ff] border border-[#d9dbe7] p-4 mb-5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#5135ab] mb-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Your request</span>
          </div>
          <p className="text-sm italic font-medium text-[#171b37] leading-relaxed">
            &ldquo;{intent.original_text}&rdquo;
          </p>
        </div>
      )}

      {/* 2. Extracted Preferences Card */}
      <div className="rounded-2xl bg-[#edf1ff] border border-[#d9dbe7] p-4 sm:p-5 mb-5">
        <div className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-[#d9dbe7]">
          <h3 className="text-sm sm:text-base font-extrabold text-[#171b37]">
            Trip details
          </h3>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0d755d]/15 border border-[#0d755d]/30 px-2.5 py-0.5 text-xs font-bold text-[#0d755d]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {fieldsCount} fields extracted
          </span>
        </div>

        {/* Structured Grid / List */}
        <div className="space-y-3.5">
          {/* Pickup */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1.5 border-b border-[#d9dbe7]/60">
            <span className="text-xs font-semibold text-[#475673] flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-[#173ed7]" />
              Pickup location
            </span>
            {isEditing ? (
              <select
                aria-label="Pickup location"
                value={pickup}
                onChange={(event) => setPickup(event.target.value)}
                className="rounded-lg bg-[#fffdf8] border border-[#d9dbe7] px-3 py-2 text-sm text-[#171b37]"
              >
                <option value="">Choose a location</option>
                {locations.map((location) => <option key={location.label}>{location.label}</option>)}
              </select>
            ) : (
              <span className="text-sm font-bold text-[#171b37]">{pickup || 'Choose a location'}</span>
            )}
          </div>

          {/* Destination */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1.5 border-b border-[#d9dbe7]/60">
            <span className="text-xs font-semibold text-[#475673] flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-[#0d755d]" />
              Destination
            </span>
            {isEditing ? (
              <select
                aria-label="Destination"
                value={dropoff}
                onChange={(event) => setDropoff(event.target.value)}
                className="rounded-lg bg-[#fffdf8] border border-[#d9dbe7] px-3 py-2 text-sm text-[#171b37]"
              >
                <option value="">Choose a location</option>
                {locations.map((location) => <option key={location.label}>{location.label}</option>)}
              </select>
            ) : (
              <span className="text-sm font-bold text-[#171b37]">{dropoff || 'Choose a location'}</span>
            )}
          </div>

        </div>
      </div>

      {/* 4. Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Button
          type="button"
          variant="primary"
          size="lg"
          fullWidth
          onClick={handleConfirm}
          disabled={!validRoute}
          className="!bg-[#173ed7] !text-white !border-[#173ed7] font-extrabold shadow-[0_0_24px_rgba(39,59,119,0.12)]"
          rightIcon={<ArrowRight className="h-4 w-4" />}
        >
          Use these trip details
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="lg"
          onClick={onEditManually}
          className="w-full sm:w-auto shrink-0 text-xs sm:text-sm"
          leftIcon={<RotateCcw className="h-4 w-4" />}
        >
          Edit manually
        </Button>
      </div>
    </div>
  );
}

export default IntentReviewCard;
