/** @type {import('tailwindcss').Config} */
export default {
  // ── Content paths ────────────────────────────────────────────────────
  // Tailwind scans these files to purge unused styles in production
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],

  // ── Dark mode ────────────────────────────────────────────────────────
  // 'class' strategy: dark mode toggled by adding `dark` class to <html>
  darkMode: 'class',

  theme: {
    extend: {

      // ── Custom color palette ────────────────────────────────────────
      // Matches the design tokens used throughout the React components
      colors: {
        // Primary brand purple
        brand: {
          50:  '#f3eeff',
          100: '#e4d5ff',
          200: '#c9aaff',
          300: '#ae80ff',
          400: '#9b6dff',   // primary accent
          500: '#7c4dff',
          600: '#5c35aa',   // button background
          700: '#3d2060',   // borders / hover states
          800: '#2a1f40',   // card backgrounds
          900: '#1a1428',   // deep backgrounds
        },

        // App surface backgrounds
        surface: {
          base:    '#0a0a0e',   // page background
          card:    '#14121a',   // card / panel
          input:   '#0f0f13',   // input fields
          border:  '#1e1e2a',   // default borders
          hover:   '#2a2a38',   // hover borders
        },

        // Semantic accent colors (matches progress tracker, community tags)
        accent: {
          blue:   '#5bbdff',
          orange: '#ff9b5b',
          green:  '#5bff9b',
          pink:   '#ff5b9b',
          yellow: '#ffdb5b',
          red:    '#ff5b5b',
        },
      },

      // ── Typography ──────────────────────────────────────────────────
      fontFamily: {
        sans:    ['"DM Sans"', 'system-ui', 'sans-serif'],
        serif:   ['"DM Serif Display"', 'Georgia', 'serif'],
        mono:    ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },

      fontSize: {
        '2xs': ['10px', { lineHeight: '14px' }],
        'xs':  ['11px', { lineHeight: '16px' }],
        'sm':  ['12px', { lineHeight: '18px' }],
        'base':['14px', { lineHeight: '22px' }],
        'md':  ['15px', { lineHeight: '24px' }],
        'lg':  ['16px', { lineHeight: '26px' }],
        'xl':  ['18px', { lineHeight: '28px' }],
        '2xl': ['20px', { lineHeight: '30px' }],
        '3xl': ['24px', { lineHeight: '34px' }],
        '4xl': ['28px', { lineHeight: '38px' }],
        '5xl': ['32px', { lineHeight: '42px' }],
      },

      // ── Spacing scale ───────────────────────────────────────────────
      // Extends default scale with a few app-specific values
      spacing: {
        '4.5':  '1.125rem',
        '13':   '3.25rem',
        '15':   '3.75rem',
        '18':   '4.5rem',
        '22':   '5.5rem',
        '26':   '6.5rem',
        '30':   '7.5rem',
        'sidebar': '220px',
      },

      // ── Border radius ───────────────────────────────────────────────
      borderRadius: {
        'xs':  '4px',
        'sm':  '6px',
        DEFAULT: '8px',
        'md':  '8px',
        'lg':  '10px',
        'xl':  '12px',
        '2xl': '16px',
        '3xl': '20px',
      },

      // ── Box shadows ─────────────────────────────────────────────────
      boxShadow: {
        'card':    '0 0 0 1px #1e1e2a',
        'card-hover': '0 0 0 1px #3d2060',
        'glow-sm': '0 0 12px rgba(155, 109, 255, 0.15)',
        'glow':    '0 0 24px rgba(155, 109, 255, 0.25)',
        'inset-t': 'inset 0 1px 0 rgba(255,255,255,0.04)',
      },

      // ── Animation ───────────────────────────────────────────────────
      keyframes: {
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-left': {
          '0%':   { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.6' },
        },
        'thinking': {
          '0%, 60%, 100%': { transform: 'translateY(0)' },
          '30%':           { transform: 'translateY(-4px)' },
        },
      },

      animation: {
        'fade-in':        'fade-in 0.2s ease-out',
        'slide-in-left':  'slide-in-left 0.2s ease-out',
        'pulse-soft':     'pulse-soft 2s ease-in-out infinite',
        'thinking':       'thinking 1.2s ease-in-out infinite',
      },

      // ── Transitions ─────────────────────────────────────────────────
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },

      // ── Z-index scale ───────────────────────────────────────────────
      zIndex: {
        'sidebar':  '40',
        'topbar':   '50',
        'modal':    '100',
        'toast':    '200',
      },
    },
  },

  // ── Plugins ──────────────────────────────────────────────────────────
  plugins: [
    // Uncomment to add official Tailwind plugins if installed:
    // require('@tailwindcss/forms'),
    // require('@tailwindcss/typography'),
    // require('@tailwindcss/line-clamp'),
  ],
}