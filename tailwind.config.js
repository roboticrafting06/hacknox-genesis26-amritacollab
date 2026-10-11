const v = (n) => `rgb(var(--${n}) / <alpha-value>)`
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: { bg: v('bg'), surface: v('surface'), ink: v('ink'), mut: v('mut'), line: v('line'),
        brand: v('brand'), soft: v('soft'), gold: v('gold'), ok: v('ok'), bad: v('bad'), warn: v('warn') },
      fontFamily: { sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'], display: ['Fraunces', 'Georgia', 'serif'] },
      boxShadow: { card: '0 1px 2px rgb(0 0 0 / .04), 0 8px 24px -12px rgb(var(--brand) / .18)' },
      keyframes: { up: { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'none' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
        shimmer: { to: { backgroundPosition: '-200% 0' } } },
      animation: { up: 'up .45s cubic-bezier(.2,.7,.2,1) both', float: 'float 7s ease-in-out infinite', shimmer: 'shimmer 1.4s linear infinite' },
    },
  },
}
