'use client';

import React, { useState } from 'react';
import { Sparkles, Bot, ArrowRight, AlertCircle } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { api } from '@/lib/api/client';
import { DEFAULT_LOCATIONS } from './LocationInput';

export interface ParsedIntentResult {
  pickup: string | null;
  dropoff: string | null;
  need_in_minutes: number | null;
  budget: number | null;
  vehicle_type: string | null;
  source: string;
  original_text: string;
}

export interface AiRequestInputProps {
  onIntentParsed: (result: ParsedIntentResult) => void;
  className?: string;
  disabled?: boolean;
}

const EXAMPLE_PROMPTS = [
  'To Chennai Airport within 25 mins',
  'VIT to Central Station under ₹500',
  'Get me a sedan to the airport before 7 PM. Keep it under ₹1,200.',
];

/**
 * Client-side intent extractor fallback when backend is offline or unreachable
 */
function localExtractIntent(
  text: string,
  knownLocations = DEFAULT_LOCATIONS
): Omit<ParsedIntentResult, 'original_text'> {
  const low = text.toLowerCase();

  // 1. Locations
  const found = knownLocations.filter((loc) =>
    low.includes(loc.label.toLowerCase()) ||
    (loc.label === 'VIT Chennai' && (low.includes('vit') || low.includes('kelambakkam'))) ||
    (loc.label === 'Chennai Airport' && (low.includes('airport') || low.includes('terminal'))) ||
    (loc.label === 'T. Nagar' && low.includes('t. nagar') || low.includes('t nagar')) ||
    (loc.label === 'OMR IT Corridor' && (low.includes('omr') || low.includes('it corridor')))
  );

  let pickup: string | null = null;
  let dropoff: string | null = null;

  if (found.length >= 2) {
    pickup = found[0].label;
    dropoff = found[1].label;
  } else if (found.length === 1) {
    if (low.startsWith('to ') || low.includes('going to ') || low.includes('drop at ')) {
      dropoff = found[0].label;
      pickup = 'VIT Chennai';
    } else {
      pickup = found[0].label;
      dropoff = 'Chennai Airport';
    }
  } else {
    // Default fallback if airport mentioned
    if (low.includes('airport')) {
      dropoff = 'Chennai Airport';
      pickup = 'VIT Chennai';
    }
  }

  // 2. Deadline / minutes
  let need_in_minutes: number | null = null;
  const minMatch = low.match(/(?:in|within|next)\s+(\d{1,3})\s*(?:min|minute)/);
  if (minMatch) {
    const mins = parseInt(minMatch[1], 10);
    if (mins >= 5 && mins <= 120) need_in_minutes = mins;
  } else if (low.includes('7 pm') || low.includes('7:00 pm')) {
    need_in_minutes = 30; // sensible deadline offset
  }

  // 3. Budget / Fare
  let budget: number | null = null;
  const budgetMatch = text.match(/(?:₹|rs\.?|inr|under|below|max)\s*(\d{1,2}(?:,\d{3})*|\d+)/i);
  if (budgetMatch) {
    const cleanNum = parseInt(budgetMatch[1].replace(/,/g, ''), 10);
    if (!isNaN(cleanNum) && cleanNum >= 100 && cleanNum <= 10000) {
      budget = cleanNum;
    }
  }

  // 4. Vehicle category
  let vehicle_type: string | null = null;
  if (low.includes('sedan')) vehicle_type = 'Sedan';
  else if (low.includes('premier') || low.includes('suv') || low.includes('prime')) vehicle_type = 'Premier';
  else if (low.includes('auto') || low.includes('rickshaw')) vehicle_type = 'Auto';
  else if (low.includes('hatchback') || low.includes('mini')) vehicle_type = 'Hatchback';

  return {
    pickup,
    dropoff,
    need_in_minutes,
    budget,
    vehicle_type,
    source: 'deterministic-offline-fallback',
  };
}

export function AiRequestInput({
  onIntentParsed,
  className = '',
  disabled = false,
}: AiRequestInputProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInterpret = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Please describe your ride first.');
      return;
    }
    if (trimmed.length < 4) {
      setError('Please provide more details (at least 4 characters).');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Try calling backend API
      const parsed = await api.parseIntent(trimmed);

      // Extract additional rich preferences like budget & vehicle from text
      const fallbackExtraction = localExtractIntent(trimmed);

      onIntentParsed({
        pickup: parsed.pickup || fallbackExtraction.pickup || 'VIT Chennai',
        dropoff: parsed.dropoff || fallbackExtraction.dropoff || 'Chennai Airport',
        need_in_minutes: parsed.need_in_minutes || fallbackExtraction.need_in_minutes || 25,
        budget: fallbackExtraction.budget || 650,
        vehicle_type: fallbackExtraction.vehicle_type || 'Sedan',
        source: parsed.source || 'llm-service',
        original_text: trimmed,
      });
    } catch {
      // 2. Offline / network fallback: use local deterministic extractor
      const fallbackResult = localExtractIntent(trimmed);
      onIntentParsed({
        pickup: fallbackResult.pickup || 'VIT Chennai',
        dropoff: fallbackResult.dropoff || 'Chennai Airport',
        need_in_minutes: fallbackResult.need_in_minutes || 25,
        budget: fallbackResult.budget || 650,
        vehicle_type: fallbackResult.vehicle_type || 'Sedan',
        source: 'local-engine (offline demo)',
        original_text: trimmed,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleInterpret();
    }
  };

  return (
    <div
      className={`relative rounded-2xl bg-gradient-to-b from-[#16172E] to-[#101424] border border-[#2B2D4F] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.4)] ${className}`}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#B79CFF]/20 text-[#B79CFF] shadow-[0_0_12px_rgba(183,156,255,0.3)]">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-xs font-extrabold tracking-wider uppercase text-[#B79CFF]">
            Ask ReHop AI
          </span>
          <span className="text-[11px] font-semibold text-[#98A5BC]/80 hidden sm:inline">
            · Natural language ride booking
          </span>
        </div>

        <Badge variant="ai" size="sm" dot>
          AI Assisted
        </Badge>
      </div>

      {/* Input area */}
      <div className="relative rounded-xl bg-[#0B0F1C] border border-[#222942] focus-within:border-[#B79CFF] focus-within:ring-1 focus-within:ring-[#B79CFF]/40 transition-all">
        <textarea
          rows={3}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled || loading}
          placeholder='e.g. "Get me a sedan to the airport before 7 PM. Keep it under ₹1,200."'
          className="w-full resize-none bg-transparent px-4 py-3 text-sm text-[#F6F8FC] placeholder:text-[#98A5BC]/45 focus:outline-none disabled:opacity-50"
        />

        {/* Action bar inside input bottom */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1C2338] px-3 py-2 bg-[#0E1324]/50 rounded-b-xl">
          <div className="flex items-center gap-1.5 text-[11px] text-[#98A5BC]/70">
            <Bot className="h-3.5 w-3.5 text-[#B79CFF]" />
            <span>AI extracts destination, time & budget</span>
          </div>

          <Button
            type="button"
            size="sm"
            variant="primary"
            onClick={handleInterpret}
            loading={loading}
            loadingText="Interpreting…"
            disabled={disabled || !text.trim()}
            className="!bg-[#B79CFF] !text-[#090F1D] !border-[#B79CFF] hover:!brightness-110 shadow-[0_0_16px_rgba(183,156,255,0.3)] text-xs font-bold px-3.5 py-1.5 h-8 min-h-[32px]"
            rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
          >
            Interpret with AI
          </Button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 mt-2 text-xs font-medium text-[#FF6D76]">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Example Prompt Chips */}
      <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium text-[#98A5BC] mr-1">Try example:</span>
        {EXAMPLE_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => {
              setText(prompt);
              if (error) setError(null);
            }}
            disabled={loading}
            className="rounded-lg bg-[#151A2E] hover:bg-[#202742] border border-[#2B3454] hover:border-[#B79CFF]/50 px-2.5 py-1 text-[11px] font-medium text-[#C4D0E5] hover:text-[#FFFFFF] transition-all text-left truncate max-w-full"
          >
            &ldquo;{prompt}&rdquo;
          </button>
        ))}
      </div>
    </div>
  );
}

export default AiRequestInput;
