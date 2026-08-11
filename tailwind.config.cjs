module.exports = {
  content: ['./src/**/*.{html,js}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'ui-serif', 'serif'],
      },
      fontWeight: {
        500: '500',
        600: '600',
        700: '700',
      },
      spacing: {
        4.5: '1.125rem',
      },
      colors: {
        ink: { DEFAULT: '#1c1a17', soft: '#4a4640', faint: '#8a847a' },
        paper: { DEFAULT: '#fbf9f4', card: '#ffffff', line: '#ece7dd' },
        brand: { DEFAULT: '#3f7d5e', dark: '#2f6049', light: '#e7f0ea' },
      },
    },
  },
};
