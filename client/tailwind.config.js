/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        heisenberg: {
          bg: '#0a0a0f',
          dark: '#0d0d18',
          card: '#111120',
          border: '#1e1e3a',
          neon: '#00d4ff',
          orange: '#ff6b00',
          gold: '#ffd700',
          green: '#00ff88',
          red: '#ff3355',
          purple: '#8b5cf6',
          text: '#e0e0ff',
          muted: '#6b6b9a',
        }
      },
      fontFamily: {
        display: ['"Orbitron"', 'sans-serif'],
        body: ['"Exo 2"', 'sans-serif'],
        mono: ['"Share Tech Mono"', 'monospace'],
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
          '0%, 100%': { boxShadow: '0 0 5px #00d4ff, 0 0 10px #00d4ff' },
          '50%': { boxShadow: '0 0 20px #00d4ff, 0 0 40px #00d4ff, 0 0 60px #00d4ff' },
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
          '0%, 100%': { borderColor: '#00d4ff' },
          '50%': { borderColor: '#ff6b00' },
        },
      },
      backgroundImage: {
        'neon-gradient': 'linear-gradient(135deg, #0a0a0f 0%, #0d1420 50%, #0a0a0f 100%)',
        'card-gradient': 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        'button-gradient': 'linear-gradient(135deg, #ff6b00, #ff3355)',
        'neon-button': 'linear-gradient(135deg, #00d4ff22, #00d4ff44)',
      },
    },
  },
  plugins: [],
};
