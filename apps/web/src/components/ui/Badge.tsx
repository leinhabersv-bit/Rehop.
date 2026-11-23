import React from 'react';

export type BadgeVariant =
  | 'simulation'
  | 'success'
  | 'warning'
  | 'danger'
  | 'ai'
  | 'neutral'
  | 'primary';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  dot?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export function Badge({
  variant = 'neutral',
  size = 'md',
  dot = false,
  icon,
  className = '',
  children,
  ...props
}: BadgeProps) {
  const variantStyles: Record<BadgeVariant, string> = {
    simulation: 'bg-[#243249]/90 text-[#98A5BC] border border-[#344663]',
    success: 'bg-[#2ED389]/15 text-[#2ED389] border border-[#2ED389]/35',
    warning: 'bg-[#FFBD63]/15 text-[#FFBD63] border border-[#FFBD63]/35',
    danger: 'bg-[#FF6D76]/15 text-[#FF6D76] border border-[#FF6D76]/35',
    ai: 'bg-[#B79CFF]/15 text-[#B79CFF] border border-[#B79CFF]/35',
    neutral: 'bg-[#1A273F] text-[#98A5BC] border border-[#243249]',
    primary: 'bg-[#B9FF45]/15 text-[#B9FF45] border border-[#B9FF45]/35',
  };

  const sizeStyles = {
    sm: 'px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase gap-1',
    md: 'px-2.5 py-1 text-xs font-semibold tracking-wide gap-1.5',
  };

  return (
    <span
      className={`
        inline-flex items-center rounded-full select-none
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      {...props}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full bg-current shrink-0 ${
            variant === 'simulation' || variant === 'ai' ? 'animate-pulse' : ''
          }`}
          aria-hidden="true"
        />
      )}
      {icon && <span className="inline-flex shrink-0 items-center">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}

export default Badge;
