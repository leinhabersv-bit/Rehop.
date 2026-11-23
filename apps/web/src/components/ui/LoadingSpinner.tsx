import React from 'react';

export interface LoadingSpinnerProps {
  variant?: 'primary' | 'ai' | 'white' | 'muted' | 'current';
  size?: 'sm' | 'md' | 'lg' | number;
  className?: string;
}

export function LoadingSpinner({
  variant = 'primary',
  size = 'md',
  className = '',
}: LoadingSpinnerProps) {
  const pixelSize = typeof size === 'number'
    ? size
    : size === 'sm'
      ? 16
      : size === 'lg'
        ? 32
        : 22;

  const colorClass =
    variant === 'primary'
      ? 'text-[#B9FF45]'
      : variant === 'ai'
        ? 'text-[#B79CFF]'
        : variant === 'white'
          ? 'text-[#F6F8FC]'
          : variant === 'muted'
            ? 'text-[#98A5BC]'
            : 'text-current';

  return (
    <svg
      className={`animate-spin ${colorClass} ${className}`}
      width={pixelSize}
      height={pixelSize}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="status"
      aria-label="Loading"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export default LoadingSpinner;
