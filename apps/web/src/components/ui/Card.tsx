import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: 'div' | 'section' | 'article';
  elevated?: boolean;
  hoverGlow?: boolean;
  glowVariant?: 'primary' | 'ai';
  interactive?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      as: Component = 'div',
      elevated = false,
      hoverGlow = false,
      glowVariant = 'primary',
      interactive = false,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const bgStyle = elevated ? 'bg-[#edf1ff]' : 'bg-[#fffdf8]';

    const glowStyle = hoverGlow
      ? glowVariant === 'ai'
        ? 'hover:border-[#5135ab]/60 hover:shadow-[0_0_24px_rgba(183,156,255,0.2)]'
        : 'hover:border-[#173ed7]/60 hover:shadow-[0_0_24px_rgba(39,59,119,0.12)]'
      : '';

    const interactiveStyle = interactive
      ? 'cursor-pointer hover:-translate-y-0.5 active:translate-y-0'
      : '';

    return (
      <Component
        ref={ref}
        className={`
          rounded-[20px] border border-[#d9dbe7] p-6 text-[#171b37]
          shadow-[0_8px_32px_rgba(39,59,119,0.12)] transition-all duration-200
          ${bgStyle}
          ${glowStyle}
          ${interactiveStyle}
          ${className}
        `}
        {...props}
      >
        {children}
      </Component>
    );
  }
);

Card.displayName = 'Card';

export default Card;
