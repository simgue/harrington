// Storybook Meadow theme. Pastel tones are fills; text on them uses the
// matching *-deep partner so it stays readable (all pairs ≥ 4.5:1).
module.exports = {
  content: ['./src/**/*.{html,js}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Lexend Variable"', 'Lexend', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Fraunces Variable"', 'Fraunces', 'Georgia', 'ui-serif', 'serif'],
      },
      fontWeight: {
        500: '500',
        600: '600',
        700: '700',
      },
      spacing: {
        4.5: '1.125rem',
        5.5: '1.375rem',
      },
      borderRadius: {
        lg: '0.875rem',
        xl: '1.125rem',
        '2xl': '1.5rem',
        '3xl': '1.75rem',
      },
      boxShadow: {
        soft: '0 1px 0 rgba(46, 42, 36, 0.04), 0 14px 30px -20px rgba(94, 78, 48, 0.38)',
      },
      colors: {
        ink: { DEFAULT: '#2e2a24', soft: '#5f574c', faint: '#6f665a' },
        paper: { DEFAULT: '#fbf6ec', card: '#fffdf8', line: '#ede3cf', deep: '#f4ecda' },
        brand: { DEFAULT: '#3f6b3b', dark: '#2e4f2b', light: '#e4eedf' },
        sage: { DEFAULT: '#a9c9a0', light: '#cfe0c6', deep: '#3f6b3b' },
        butter: { DEFAULT: '#f2c14e', light: '#fbecc4', deep: '#8a6412' },
        rose: { DEFAULT: '#f3b7a8', light: '#fbe5de', deep: '#a4473a' },
        sky: { DEFAULT: '#bfdcec', light: '#e3eff6', deep: '#2f6285' },
        lavender: { DEFAULT: '#d6caea', light: '#eee8f6', deep: '#5b4a86' },
      },
    },
  },
};
