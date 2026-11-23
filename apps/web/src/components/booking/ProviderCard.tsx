'use client';

import React from 'react';
import { Car, Clock, Check, AlertCircle } from 'lucide-react';
import type { Quote } from '@/types';
import { providerName } from '@/types';

export interface ProviderCardProps {
  quote: Quote;
  isSelected?: boolean;
  onSelect?: (quoteId: string) => void;
  maxFare?: number;
  isBooking?: boolean;
  tag?: string;
  simulatedTimeMs: number;
  deadlineMs: number;
  className?: string;
}

export function isQuoteExpired(quote: Pick<Quote, 'expires_at'>, currentTimeMs: number = Date.now()): boolean {
  if (!quote.expires_at) return false;
  return currentTimeMs >= new Date(quote.expires_at).getTime();
}

export function isQuoteWithinPolicy(
  quote: Pick<Quote, 'estimated_fare_inr'>,
  policyOrMaxFare: number | { max_total_fare_inr: number }
): boolean {
  const maxFare = typeof policyOrMaxFare === 'number' ? policyOrMaxFare : policyOrMaxFare.max_total_fare_inr;
  return quote.estimated_fare_inr <= maxFare;
}

export function ProviderCard({
  quote,
  isSelected = false,
  onSelect,
  maxFare,
  isBooking = false,
  tag,
  simulatedTimeMs,
  deadlineMs,
  className = '',
}: ProviderCardProps) {
  const isExpired = isQuoteExpired(quote, simulatedTimeMs);
  const expiresAt = new Date(quote.expires_at).toISOString().slice(11, 19);
  const meetsDeadline = simulatedTimeMs + quote.pickup_eta_sec * 1000 <= deadlineMs;
  const isExceedingBudget = typeof maxFare === 'number' && !isQuoteWithinPolicy(quote, maxFare);
  const isSelectable = !isExpired && !isExceedingBudget && !isBooking;

  // Format pickup ETA
  const etaMinutes = Math.max(1, Math.ceil(quote.pickup_eta_sec / 60));

  // Determine tag styling
  const renderTag = () => {
    if (isExpired) {
      return (
        <span className="inline-flex items-center rounded-md bg-[#edf1ff] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[#a42644] border border-[#d9dbe7]">
          Quote Expired
        </span>
      );
    }
    if (!tag) return null;
    const lower = tag.toLowerCase();

    if (lower.includes('best fit') || lower.includes('best value')) {
      return (
        <span className="inline-flex items-center rounded-md bg-[#edf1ff] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[#173ed7] border border-[#d9dbe7]">
          {tag}
        </span>
      );
    }
    if (lower.includes('lowest') || lower.includes('budget') || lower.includes('fare')) {
      return (
        <span className="inline-flex items-center rounded-md bg-[#edf1ff] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[#475673] border border-[#d9dbe7]">
          {tag}
        </span>
      );
    }
    if (lower.includes('fast') || lower.includes('reliable') || lower.includes('urgent')) {
      return (
        <span className="inline-flex items-center rounded-md bg-[#edf1ff] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[#475673] border border-[#d9dbe7]">
          {tag}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center rounded-md bg-[#edf1ff] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#475673] border border-[#d9dbe7]">
        {tag}
      </span>
    );
  };

  return (
    <label
      className={`
        group relative block rounded-2xl focus-within:ring-2 focus-within:ring-[#173ed7]/50 p-4 sm:p-5 transition-all duration-200 select-none outline-none
        ${
          isSelected
            ? 'bg-[#edf1ff] border-2 border-[#173ed7] shadow-[0_0_24px_rgba(39,59,119,0.12)]'
            : isExceedingBudget
            ? 'bg-[#edf1ff]/60 border border-[#d9dbe7] opacity-60 cursor-not-allowed'
            : 'bg-[#edf1ff] border border-[#d9dbe7] hover:border-[#d9dbe7] hover:bg-[#edf1ff] cursor-pointer'
        }
        ${className}
      `}
    >
      <input
        type="radio"
        name="ride-quote"
        aria-label={providerName[quote.provider]}
        className="sr-only"
        checked={isSelected}
        disabled={!isSelectable}
        onChange={() => onSelect?.(quote.quote_id)}
      />
      {/* Top Details Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3.5">
          {/* Vehicle Icon Box */}
          <div
            className={`
              flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors
              ${
                isSelected
                  ? 'bg-[#edf1ff] text-[#173ed7] border border-[#173ed7]/40'
                  : 'bg-[#edf1ff] text-[#475673] border border-white/5 group-hover:text-[#171b37]'
              }
            `}
          >
            <Car className="h-5 w-5" />
          </div>

          {/* Provider Title & Subtext */}
          <div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-base font-bold text-[#171b37] tracking-tight">
                {providerName[quote.provider] || quote.provider}
              </h3>
            </div>

            <p className="mt-0.5 text-xs text-[#475673]">
              <span>{meetsDeadline ? 'Within pickup deadline' : 'After pickup deadline'}</span>
              <span className="mx-1.5 text-[#475673]">·</span>
              <span>Pickup in </span>
              <strong className="font-bold text-[#173ed7]">{etaMinutes} min</strong>
            </p>
          </div>
        </div>

        {/* Fare & Sublabel */}
        <div className="text-right shrink-0">
          <div className="text-2xl font-black tracking-tight text-[#171b37]">
            ₹{quote.estimated_fare_inr.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] font-medium text-[#475673]">estimated fare</div>
        </div>
      </div>

      {/* Middle Warning if Budget Exceeded */}
      {isExceedingBudget && (
        <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-[#a42644]/10 px-3 py-1.5 text-xs font-semibold text-[#a42644] border border-[#a42644]/20">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Exceeds policy budget limit of ₹{maxFare}</span>
        </div>
      )}

      {/* Bottom Row: Tags, Expiry & Radio / Action */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#d9dbe7]/80 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          {renderTag()}

          {/* Expiry Countdown Indicator */}
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-medium ${
              isExpired ? 'text-[#a42644]' : 'text-[#475673]'
            }`}
          >
            <Clock className="h-3 w-3" />
            <span>{isExpired ? "Expired" : `Expires ${expiresAt} UTC (simulated)`}</span>
          </span>
        </div>

        {/* Action / Radio Selector */}
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={`
              rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all duration-150
              ${
                isSelected
                  ? 'bg-[#173ed7] text-white shadow-[0_0_12px_rgba(39,59,119,0.12)] hover:brightness-105'
                  : !isSelectable
                  ? 'bg-[#e4eaff]/50 text-[#475673] cursor-not-allowed'
                  : 'bg-[#edf1ff] text-[#171b37] hover:bg-[#edf1ff] hover:text-[#173ed7]'
              }
            `}
          >
            {isExpired ? 'Expired' : isSelected ? 'Selected' : 'Select ride'}
          </span>

          {/* Radio Checkmark Circle */}
          <div
            aria-hidden="true"
            className={`
              flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all
              ${
                isSelected
                  ? 'bg-[#173ed7] text-white'
                  : 'border-2 border-[#d9dbe7] bg-transparent group-hover:border-slate-400'
              }
            `}
          >
            {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
          </div>
        </div>
      </div>
    </label>
  );
}

export default ProviderCard;
