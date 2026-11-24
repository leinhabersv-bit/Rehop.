import React, { useId } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  icon?: React.ReactNode;
  rightElement?: React.ReactNode;
  containerClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      error,
      icon,
      rightElement,
      containerClassName = '',
      className = '',
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || (label ? generatedId : undefined);

    return (
      <div className={`flex flex-col w-full ${containerClassName}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[#475673]"
          >
            {label}
          </label>
        )}

        <div className="relative flex items-center w-full">
          {icon && (
            <div className="absolute left-3.5 flex items-center justify-center text-[#475673] pointer-events-none select-none">
              {icon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={
              error
                ? `${inputId}-error`
                : helperText
                  ? `${inputId}-helper`
                  : undefined
            }
            className={`
              w-full rounded-[14px] bg-[#fffdf8] border px-4 py-3 text-sm text-[#171b37] placeholder:text-[#475673]/50
              transition-colors duration-150 focus:outline-none
              ${icon ? 'pl-11' : ''}
              ${rightElement ? 'pr-11' : ''}
              ${
                error
                  ? 'border-[#a42644] focus:border-[#a42644] focus:ring-1 focus:ring-[#a42644]'
                  : 'border-[#d9dbe7] focus:border-[#173ed7] focus:ring-1 focus:ring-[#173ed7]'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed bg-[#fffdf8]/50' : ''}
              ${className}
            `}
            {...props}
          />

          {rightElement && (
            <div className="absolute right-3.5 flex items-center justify-center text-[#475673]">
              {rightElement}
            </div>
          )}
        </div>

        {error ? (
          <p id={`${inputId}-error`} className="mt-1.5 text-xs font-medium text-[#a42644]">
            {error}
          </p>
        ) : helperText ? (
          <p id={`${inputId}-helper`} className="mt-1.5 text-xs text-[#475673]">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
