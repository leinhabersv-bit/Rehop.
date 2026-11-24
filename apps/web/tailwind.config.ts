import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // ReHop Core Palette
        primary: {
          DEFAULT: '#B9FF45',
          hover: '#c8ff6a',
          dark: '#9be028',
        },
        background: '#090F1D',
        surface: {
          DEFAULT: '#151F32',
          alt: '#243249',
          elevated: '#1A273F',
        },
        surfaceAlt: '#243249',
        surfaceElevated: '#1A273F',
        rehop: {
          primary: '#B9FF45',
          bg: '#090F1D',
          surface: '#151F32',
          surfaceAlt: '#243249',
          surfaceElevated: '#1A273F',
          text: '#F6F8FC',
          muted: '#98A5BC',
          success: '#2ED389',
          warning: '#FFBD63',
          danger: '#FF6D76',
          ai: '#B79CFF',
        },
        text: {
          DEFAULT: '#F6F8FC',
          muted: '#98A5BC',
        },
        muted: '#98A5BC',
        success: '#2ED389',
        warning: '#FFBD63',
        danger: '#FF6D76',
        ai: '#B79CFF',

        // Backward compatibility for existing screens
        deep: '#0b1e2d',
        teal: '#078a81',
        mint: '#67e8bf',
        ink: '#112c3c',
      },
      borderRadius: {
        button: '16px',
        card: '20px',
        'rehop-btn': '16px',
        'rehop-card': '20px',
      },
      boxShadow: {
        card: '0 8px 36px rgba(12,50,62,.09)',
        'rehop-card': '0 8px 32px 0 rgba(0, 0, 0, 0.4)',
        'rehop-elevated': '0 12px 40px 0 rgba(0, 0, 0, 0.55)',
        'rehop-glow': '0 0 24px rgba(185, 255, 69, 0.25)',
        'rehop-ai-glow': '0 0 24px rgba(183, 156, 255, 0.25)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
