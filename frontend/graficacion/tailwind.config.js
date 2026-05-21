/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{html,ts}',
  ],
  theme: {
    extend: {
      colors: {
        specora: {
          surface: '#f7f9fb',
          'surface-low': '#f2f4f6',
          container: '#ffffff',
          line: '#e2e8f0',
          outline: '#76777d',
          ink: '#191c1e',
          muted: '#565e74',
          primary: '#0f172a',
          secondary: '#505f76',
          error: '#ba1a1a'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        sm: '0.125rem',
        DEFAULT: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem'
      },
      boxShadow: {
        industrial: '0 4px 6px -1px rgba(15, 23, 42, 0.08)'
      }
    },
  },
  plugins: [],
};
