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
    simulation: 'bg-[#d9dbe7]/90 text-[#475673] border border-[#d9dbe7]',
    success: 'bg-[#0d755d]/15 text-[#0d755d] border border-[#0d755d]/35',
    warning: 'bg-[#8d471d]/15 text-[#8d471d] border border-[#8d471d]/35',
    danger: 'bg-[#a42644]/15 text-[#a42644] border border-[#a42644]/35',
    ai: 'bg-[#5135ab]/15 text-[#5135ab] border border-[#5135ab]/35',
    neutral: 'bg-[#edf1ff] text-[#475673] border border-[#d9dbe7]',
    primary: 'bg-[#173ed7]/15 text-[#173ed7] border border-[#173ed7]/35',
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
