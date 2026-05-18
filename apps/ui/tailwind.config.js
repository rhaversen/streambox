/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontSize: {
        'tv-xs':  ['1.1rem',  { lineHeight: '1.6rem' }],
        'tv-sm':  ['1.4rem',  { lineHeight: '2rem' }],
        'tv-base':['1.8rem',  { lineHeight: '2.6rem' }],
        'tv-lg':  ['2.4rem',  { lineHeight: '3.2rem' }],
        'tv-xl':  ['3.2rem',  { lineHeight: '4rem' }],
        'tv-2xl': ['4.8rem',  { lineHeight: '5.6rem' }],
        'tv-4xl': ['7.2rem',  { lineHeight: '8rem' }],
      },
    },
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        '.scrollbar-none': {
          '-ms-overflow-style': 'none',
          'scrollbar-width': 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        },
      })
    },
  ],
}
