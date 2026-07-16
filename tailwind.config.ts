import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/app/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        arabic: ['var(--font-tajawal)', 'system-ui', 'sans-serif'],
        // Poster design system (superseded on the dashboard by the neon-arcade
        // redesign below, kept here only so nothing else that might reference
        // it breaks) — its own keys so the existing `font-sans`/`font-arabic`
        // used everywhere else in the app are completely unaffected.
        'poster-display': ['Cabinet Grotesk', 'var(--font-cairo)', 'system-ui', 'sans-serif'],
        'poster-sans': ['Satoshi', 'var(--font-cairo)', 'system-ui', 'sans-serif'],
        // Neon-arcade design system (dashboard redesign, from design_handoff_bolos_alley).
        // Tajawal is already the site's Arabic face; here it becomes the
        // primary UI face (AR+EN) within `.neon-theme` only — see globals.css.
        'neon-display': ['var(--font-orbitron)', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Bolos brand
        gold: {
          DEFAULT: '#D4AF37',
          50: '#FBF7E7',
          100: '#F6EFCE',
          200: '#EDDF9D',
          300: '#E3CF6C',
          400: '#DABF3B',
          500: '#D4AF37',
          600: '#A98C2C',
          700: '#7F6921',
          800: '#544616',
          900: '#2A230B',
        },
        // Poster design system (dashboard proof-of-concept only) — separate
        // namespace from `primary`/`secondary`/etc. above, which the rest of
        // the app already relies on for the dark+gold theme. Every value
        // here resolves to a CSS var scoped to `.poster-theme` (see
        // globals.css), so these classes are inert anywhere that wrapper
        // isn't present.
        poster: {
          paper: 'var(--poster-paper)',
          'paper-raised': 'var(--poster-paper-raised)',
          ink: 'var(--poster-ink)',
          'ink-muted': 'var(--poster-ink-muted)',
          line: 'var(--poster-line)',
          primary: 'var(--poster-primary)',
          'primary-ink': 'var(--poster-primary-ink)',
          secondary: 'var(--poster-secondary)',
          gold: 'var(--poster-accent-gold)',
          green: 'var(--poster-accent-green)',
          blue: 'var(--poster-accent-blue)',
          pink: 'var(--poster-accent-pink)',
        },
        // Neon-arcade design system (dashboard redesign only) — separate
        // namespace, inert anywhere outside `.neon-theme`.
        neon: {
          bg: 'var(--neon-bg-base)',
          surface1: 'var(--neon-surface-1)',
          magenta: 'var(--neon-magenta)',
          'magenta-soft': 'var(--neon-magenta-soft)',
          purple: 'var(--neon-purple)',
          'purple-lt': 'var(--neon-purple-lt)',
          cyan: 'var(--neon-cyan)',
          'cyan-lt': 'var(--neon-cyan-lt)',
          gold: 'var(--neon-gold)',
          'text-hi': 'var(--neon-text-hi)',
          'text-mid': 'var(--neon-text-mid)',
          'text-lo': 'var(--neon-text-lo)',
          'border-div': 'var(--neon-border-div)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'gold-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(212, 175, 55, 0.6)' },
          '50%': { boxShadow: '0 0 0 12px rgba(212, 175, 55, 0)' },
        },
        'danger-blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        // Neon-arcade design system — named exactly per the handoff README.
        bolosGlow: {
          '0%, 100%': { boxShadow: '0 0 32px -6px rgba(255,45,158,.55), 0 0 60px -20px rgba(123,47,247,.5)' },
          '50%': { boxShadow: '0 0 44px -4px rgba(255,45,158,.8), 0 0 80px -14px rgba(123,47,247,.7)' },
        },
        bolosPulse: {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 0 0 rgba(47,243,243,.6)' },
          '50%': { opacity: '.5', boxShadow: '0 0 0 6px rgba(47,243,243,0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'gold-pulse': 'gold-pulse 2s infinite',
        'danger-blink': 'danger-blink 0.8s ease-in-out infinite',
        bolosGlow: 'bolosGlow 4s ease-in-out infinite',
        bolosPulse: 'bolosPulse 2s infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
