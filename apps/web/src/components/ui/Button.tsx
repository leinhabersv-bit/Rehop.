import React from 'react';
import { LoadingSpinner } from './LoadingSpinner';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  loadingText?: string;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      loadingText,
      fullWidth = false,
      leftIcon,
      rightIcon,
      disabled,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-bold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#173ed7] focus-visible:ring-offset-2 focus-visible:ring-offset-[#d9dbe7] select-none';

    const variantStyles = {
      primary:
        'bg-[#173ed7] text-white border border-[#173ed7] hover:brightness-105 active:scale-[0.99] shadow-[0_2px_12px_rgba(39,59,119,0.12)]',
      secondary:
        'bg-[#d9dbe7] text-[#171b37] border border-[#d9dbe7] hover:bg-[#edf1ff] hover:border-[#d9dbe7] active:scale-[0.99]',
      outline:
        'bg-transparent text-[#171b37] border border-[#d9dbe7] hover:border-[#173ed7] hover:text-[#173ed7] active:scale-[0.99]',
      ghost:
        'bg-transparent text-[#475673] border border-transparent hover:text-[#171b37] hover:bg-[#fffdf8] active:scale-[0.99]',
      danger:
        'bg-[#a42644]/15 text-[#a42644] border border-[#a42644]/30 hover:bg-[#a42644]/25 active:scale-[0.99]',
    };

    const sizeStyles = {
      sm: 'text-xs px-3.5 py-1.5 rounded-xl min-h-[34px] gap-1.5',
      md: 'text-sm px-5 py-2.5 rounded-[16px] min-h-[44px] gap-2',
      lg: 'text-base px-6 py-3.5 rounded-[16px] min-h-[52px] gap-2.5',
    };

    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`
          ${baseStyles}
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${fullWidth ? 'w-full' : ''}
          ${isDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none shadow-none' : ''}
          ${className}
        `}
        {...props}
      >
        {loading ? (
          <>
            <LoadingSpinner
              size={size === 'lg' ? 'md' : 'sm'}
              variant={variant === 'primary' ? 'current' : 'white'}
            />
            {loadingText ? <span>{loadingText}</span> : children}
          </>
        ) : (
          <>
            {leftIcon && <span className="inline-flex shrink-0 items-center">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="inline-flex shrink-0 items-center">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
