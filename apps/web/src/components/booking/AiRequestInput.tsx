'use client';

import React, { useState } from 'react';
import { Sparkles, Bot, ArrowRight, AlertCircle } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { api } from '@/lib/api/client';

export interface ParsedIntentResult {
  pickup: string | null;
  dropoff: string | null;
  need_in_minutes: number | null;
  budget: number | null;
  source: string;
  original_text: string;
}

export interface AiRequestInputProps {
  onIntentParsed: (result: ParsedIntentResult) => void;
  className?: string;
  disabled?: boolean;
}

const EXAMPLE_PROMPTS = [
  'To Chennai Airport within 25 minutes',
  'From Chennai Airport to VIT Chennai under ₹500',
  'From VIT Chennai to Chennai Airport, pickup within 15 minutes. Keep it under ₹1,200.',
];

export function parseBudget(text: string): number | null {
  const match = text.match(/(?:₹|\b(?:rs\.?|inr)\s*)\s*([\d,]+)|\b(?:under|below|max(?:imum)?)\s+([\d,]+)/i);
  const amount = Number((match?.[1] ?? match?.[2] ?? '').replaceAll(',', ''));
  return Number.isInteger(amount) && amount >= 100 && amount <= 10000 ? amount : null;
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
    if (loading || disabled) return;
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
      const parsed = await api.parseIntent(trimmed);
      onIntentParsed({
        pickup: parsed.pickup,
        dropoff: parsed.dropoff,
        need_in_minutes: parsed.need_in_minutes,
        budget: parseBudget(trimmed),
        source: parsed.source,
        original_text: trimmed,
      });
    } catch {
      setError('Request interpretation is unavailable. Try again or enter your trip below.');
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
          aria-label="Describe your ride"
          maxLength={500}
          rows={3}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled || loading}
          placeholder='e.g. "From VIT Chennai to Chennai Airport, pickup within 15 minutes."'
          className="w-full resize-none bg-transparent px-4 py-3 text-sm text-[#F6F8FC] placeholder:text-[#98A5BC]/45 focus:outline-none disabled:opacity-50"
        />

        {/* Action bar inside input bottom */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1C2338] px-3 py-2 bg-[#0E1324]/50 rounded-b-xl">
          <div className="flex items-center gap-1.5 text-[11px] text-[#98A5BC]/70">
            <Bot className="h-3.5 w-3.5 text-[#B79CFF]" />
            <span>Review suggested locations, pickup time and budget</span>
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
        <div role="alert" className="flex items-center gap-2 mt-2 text-xs font-medium text-[#FF6D76]">
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
