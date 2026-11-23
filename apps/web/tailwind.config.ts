import type { Config } from 'tailwindcss';
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: { extend: {
    colors: { deep: '#0b1e2d', teal: '#078a81', mint: '#67e8bf', ink: '#112c3c', muted: '#536f7b' },
    boxShadow: { card: '0 8px 36px rgba(12,50,62,.09)' }
  }}, plugins: []
} satisfies Config;
