'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  Info,
  ArrowRight,
  Edit3,
  Clock,
  Car,
  MapPin,
  RotateCcw,
} from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import type { ParsedIntentResult } from './AiRequestInput';

export interface IntentReviewCardProps {
  intent: ParsedIntentResult;
  onConfirmAndFind: (confirmedValues: {
    pickup: string;
    dropoff: string;
    need_in_minutes: number;
    budget: number;
    vehicle_type: string;
  }) => void;
  onEditManually: () => void;
  className?: string;
}

const VEHICLE_OPTIONS = ['Hatchback', 'Sedan', 'Auto', 'Premier'];
const TIME_OPTIONS = [15, 20, 25, 30, 45, 60];

export function IntentReviewCard({
  intent,
  onConfirmAndFind,
  onEditManually,
  className = '',
}: IntentReviewCardProps) {
  // Editable fields within the review card
  const [pickup, setPickup] = useState(intent.pickup || 'VIT Chennai');
  const [dropoff, setDropoff] = useState(intent.dropoff || 'Chennai Airport');
  const [needInMinutes, setNeedInMinutes] = useState(intent.need_in_minutes || 25);
  const [budget, setBudget] = useState(intent.budget || 650);
  const [vehicleType, setVehicleType] = useState(intent.vehicle_type || 'Sedan');
  const [isEditing, setIsEditing] = useState(false);

  // Field extraction count
  const fieldsCount = [pickup, dropoff, needInMinutes, budget, vehicleType].filter(Boolean).length;

  const handleConfirm = () => {
    onConfirmAndFind({
      pickup,
      dropoff,
      need_in_minutes: needInMinutes,
      budget,
      vehicle_type: vehicleType,
    });
  };

  return (
    <div
      className={`relative rounded-3xl bg-[#0D1524] border border-[#233550] p-6 sm:p-7 shadow-[0_12px_48px_rgba(0,0,0,0.5)] ${className}`}
    >
      {/* Top Header / Eyebrow */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Badge
            variant="ai"
            size="md"
            dot
            className="!bg-[#B79CFF]/15 !text-[#B79CFF] !border-[#B79CFF]/40 font-extrabold uppercase tracking-wider text-[11px]"
          >
            AI REQUEST · 02 / 03
          </Badge>
          <span className="text-xs font-semibold text-[#98A5BC]">
            AI Parsed · <span className="text-[#F6F8FC] font-medium">{intent.source}</span>
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsEditing(!isEditing)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#B9FF45] hover:underline hover:brightness-110 transition-colors"
        >
          <Edit3 className="h-3.5 w-3.5" />
          {isEditing ? 'Done editing' : 'Quick edit'}
        </button>
      </div>

      {/* Main Heading */}
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[#F6F8FC]">
          We understood your ride.
        </h2>
        <p className="text-sm font-medium text-[#98A5BC] mt-1">
          Review the details before searching available simulated providers.
        </p>
      </div>

      {/* 1. Original User Request Quote Box */}
      {intent.original_text && (
        <div className="rounded-2xl bg-[#10192A] border border-[#1E2E46] p-4 mb-5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#B79CFF] mb-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Your request</span>
          </div>
          <p className="text-sm italic font-medium text-[#F6F8FC] leading-relaxed">
            &ldquo;{intent.original_text}&rdquo;
          </p>
        </div>
      )}

      {/* 2. Extracted Preferences Card */}
      <div className="rounded-2xl bg-[#10192A] border border-[#1E2E46] p-4 sm:p-5 mb-5">
        <div className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-[#1E2E46]">
          <h3 className="text-sm sm:text-base font-extrabold text-[#F6F8FC]">
            Extracted preferences
          </h3>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#2ED389]/15 border border-[#2ED389]/30 px-2.5 py-0.5 text-xs font-bold text-[#2ED389]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {fieldsCount} fields extracted
          </span>
        </div>

        {/* Structured Grid / List */}
        <div className="space-y-3.5">
          {/* Pickup */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1.5 border-b border-[#162235]/60">
            <span className="text-xs font-semibold text-[#98A5BC] flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-[#B9FF45]" />
              Pickup location
            </span>
            {isEditing ? (
              <input
                type="text"
                value={pickup}
                onChange={(e) => setPickup(e.target.value)}
                className="rounded-lg bg-[#151F32] border border-[#2B3E5C] px-3 py-1.5 text-xs font-semibold text-[#F6F8FC] focus:outline-none focus:border-[#B9FF45]"
              />
            ) : (
              <span className="text-sm font-bold text-[#F6F8FC]">{pickup}</span>
            )}
          </div>

          {/* Destination */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1.5 border-b border-[#162235]/60">
            <span className="text-xs font-semibold text-[#98A5BC] flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-[#2ED389]" />
              Destination
            </span>
            {isEditing ? (
              <input
                type="text"
                value={dropoff}
                onChange={(e) => setDropoff(e.target.value)}
                className="rounded-lg bg-[#151F32] border border-[#2B3E5C] px-3 py-1.5 text-xs font-semibold text-[#F6F8FC] focus:outline-none focus:border-[#B9FF45]"
              />
            ) : (
              <span className="text-sm font-bold text-[#F6F8FC]">{dropoff}</span>
            )}
          </div>

          {/* Arrival Deadline / Pickup needed in */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1.5 border-b border-[#162235]/60">
            <span className="text-xs font-semibold text-[#98A5BC] flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-[#B9FF45]" />
              Pickup needed within
            </span>
            {isEditing ? (
              <div className="flex items-center gap-1.5">
                {TIME_OPTIONS.map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setNeedInMinutes(mins)}
                    className={`px-2 py-1 rounded text-xs font-bold transition-colors ${
                      needInMinutes === mins
                        ? 'bg-[#B9FF45] text-[#090F1D]'
                        : 'bg-[#151F32] text-[#98A5BC] hover:text-[#F6F8FC]'
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-sm font-bold text-[#B9FF45]">
                Within {needInMinutes} minutes
              </span>
            )}
          </div>

          {/* Max Fare / Budget */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1.5 border-b border-[#162235]/60">
            <span className="text-xs font-semibold text-[#98A5BC] flex items-center gap-2">
              <span className="text-[#B9FF45] font-black text-sm">₹</span>
              Maximum fare cap
            </span>
            {isEditing ? (
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-[#98A5BC]">₹</span>
                <input
                  type="number"
                  min={100}
                  max={5000}
                  step={50}
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  className="w-24 rounded-lg bg-[#151F32] border border-[#2B3E5C] px-2 py-1 text-xs font-semibold text-[#F6F8FC] focus:outline-none focus:border-[#B9FF45]"
                />
              </div>
            ) : (
              <span className="text-sm font-extrabold text-[#F6F8FC]">₹{budget}</span>
            )}
          </div>

          {/* Vehicle Type */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1.5">
            <span className="text-xs font-semibold text-[#98A5BC] flex items-center gap-2">
              <Car className="h-3.5 w-3.5 text-[#B9FF45]" />
              Vehicle category
            </span>
            {isEditing ? (
              <div className="flex items-center gap-1.5">
                {VEHICLE_OPTIONS.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setVehicleType(cat)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                      vehicleType.toLowerCase() === cat.toLowerCase()
                        ? 'bg-[#B9FF45] text-[#090F1D]'
                        : 'bg-[#151F32] text-[#98A5BC] hover:text-[#F6F8FC]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-sm font-bold text-[#F6F8FC]">{vehicleType}</span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Safety / Policy Callout Card */}
      <div className="rounded-2xl bg-[#0C1E26] border border-[#14353D] p-4 mb-6">
        <div className="flex items-start gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#38BDF8]/20 text-[#38BDF8] mt-0.5">
            <Info className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h4 className="text-xs sm:text-sm font-bold text-[#F6F8FC]">
              AI is assisting, not booking
            </h4>
            <p className="text-xs font-medium text-[#98A5BC] mt-0.5 leading-relaxed">
              You can edit every field. Booking always requires your explicit confirmation, and no
              fare is charged without your approval.
            </p>
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
          className="!bg-[#B9FF45] !text-[#090F1D] !border-[#B9FF45] font-extrabold shadow-[0_0_24px_rgba(185,255,69,0.35)]"
          rightIcon={<ArrowRight className="h-4 w-4" />}
        >
          Looks good · Find rides
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
