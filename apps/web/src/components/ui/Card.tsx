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
    const bgStyle = elevated ? 'bg-[#1A273F]' : 'bg-[#151F32]';

    const glowStyle = hoverGlow
      ? glowVariant === 'ai'
        ? 'hover:border-[#B79CFF]/60 hover:shadow-[0_0_24px_rgba(183,156,255,0.2)]'
        : 'hover:border-[#B9FF45]/60 hover:shadow-[0_0_24px_rgba(185,255,69,0.2)]'
      : '';

    const interactiveStyle = interactive
      ? 'cursor-pointer hover:-translate-y-0.5 active:translate-y-0'
      : '';

    return (
      <Component
        ref={ref}
        className={`
          rounded-[20px] border border-[#243249] p-6 text-[#F6F8FC]
          shadow-[0_8px_32px_rgba(0,0,0,0.36)] transition-all duration-200
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
