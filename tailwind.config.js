/**
 * Tailwind CSS configuration for the Adonai Thrift Store storefront.
 *
 * The design tokens below are the single source of truth for the brand
 * colours used by the Edge views and resources/css/app.css.
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './resources/views/**/*.edge',
    './resources/js/**/*.js',
    './app/**/*.{ts,js}',
    './config/**/*.ts',
  ],
  theme: {
    extend: {
      colors: {
        adonai: {
          /* Purple action colour */
          primary: '#6C5CE7',
          primaryDark: '#5748D2',
          /* Lavender highlight */
          lavender: '#F3F0FF',
          lavenderStrong: '#E9E4FF',
          /* White / grey canvas */
          canvas: '#F8F8FB',
          /* Ink */
          ink: '#16141F',
          night: '#1E1E2C',
          muted: '#74717F',
          line: '#E8E6EF',
          skeleton: '#EEF0F3',
          skeletonDark: '#D9DDE4',
        },
      },
      boxShadow: {
        card: '0 4px 14px #16141f0f',
      },
    },
  },
  plugins: [],
}
