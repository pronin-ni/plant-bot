import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif']
      },
      fontSize: {
        'ios-large-title': ['34px', { lineHeight: '1.08', letterSpacing: '-0.02em', fontWeight: '700' }],
        'ios-title-1': ['28px', { lineHeight: '1.1', letterSpacing: '-0.01em', fontWeight: '700' }],
        'ios-title-2': ['22px', { lineHeight: '1.15', letterSpacing: '-0.01em', fontWeight: '600' }],
        'ios-body': ['17px', { lineHeight: '1.35', letterSpacing: '-0.005em' }],
        'ios-caption': ['13px', { lineHeight: '1.3', letterSpacing: '0' }]
      },
      borderRadius: {
        'ios-card': '24px',
        'ios-button': '20px',
        'ios-tab': '20px'
      },
      colors: {
        ios: {
          accent: 'var(--ios-accent)',
          bg: 'rgb(var(--ios-bg) / <alpha-value>)',
          card: 'rgb(var(--ios-card) / <alpha-value>)',
          text: 'rgb(var(--ios-text) / <alpha-value>)',
          subtext: 'rgb(var(--ios-subtext) / <alpha-value>)',
          border: 'rgb(var(--ios-border) / <alpha-value>)'
        }
      },
      boxShadow: {
        ios: '0 10px 30px rgba(0, 0, 0, 0.08)',
        'ios-strong': '0 12px 34px rgba(0, 0, 0, 0.14)'
      },
      backdropBlur: {
        ios: '20px'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
};

export default config;
