/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        heisenberg: {
          bg: '#09090b',
          dark: '#101012',
          card: '#141416',
          border: '#26262a',
          neon: '#f7931a',
          orange: '#fb923c',
          gold: '#fbbf24',
          green: '#10b981',
          red: '#ef4444',
          purple: '#60a5fa',
          text: '#fafafa',
          muted: '#a1a1aa',
        }
      },
      fontFamily: {
        display: ['"Space Grotesk"', '"Inter"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        sans: ['"Inter"', 'sans-serif'],
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'chip-fly': 'chip-fly 0.5s ease-out forwards',
        'card-deal': 'card-deal 0.3s ease-out forwards',
        'pulse-neon': 'pulse-neon 1.5s ease-in-out infinite',
        'border-glow': 'border-glow 2s ease-in-out infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 1px rgba(247,147,26,0.4)' },
          '50%': { boxShadow: '0 0 0 1px rgba(247,147,26,0.8)' },
        },
        'chip-fly': {
          '0%': { transform: 'translateY(0) scale(1)', opacity: '1' },
          '100%': { transform: 'translateY(-60px) scale(0.5)', opacity: '0' },
        },
        'card-deal': {
          '0%': { transform: 'translateX(-200px) rotate(-10deg)', opacity: '0' },
          '100%': { transform: 'translateX(0) rotate(0)', opacity: '1' },
        },
        'pulse-neon': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'border-glow': {
          '0%, 100%': { borderColor: '#f7931a' },
          '50%': { borderColor: '#ffb020' },
        },
      },
      backgroundImage: {
        'neon-gradient': 'linear-gradient(135deg, #09090b 0%, #131316 50%, #09090b 100%)',
        'card-gradient': 'linear-gradient(135deg, #17171a 0%, #121214 100%)',
        'button-gradient': 'linear-gradient(135deg, #f7931a, #ffb020)',
        'neon-button': 'linear-gradient(135deg, #f7931a22, #f7931a44)',
      },
    },
  },
  plugins: [],
};
