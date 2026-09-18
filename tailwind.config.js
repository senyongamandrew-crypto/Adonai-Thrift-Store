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
        /**
         * The shop's own colours, taken from the Adonai Thrift Store logo:
         * copper, warm black and sage green. Nothing outside the logo is used,
         * so the website and the sign above the shop finally agree.
         */
        adonai: {
          /**
           * Copper, from the T-shirt outline in the logo. Used for buttons and
           * links it is deepened by 4% from the exact logo value: the logo's own
           * #A6693F gives white text on a button only 4.46:1, under the 4.5 the
           * accessibility guidelines ask for, which shows up as hard-to-read
           * button text on a phone in daylight. This shade is indistinguishable
           * to the eye and passes everywhere. The logo image itself is untouched.
           */
          primary: '#9F653C',
          primaryDark: '#8A5834',
          /* A wash of copper, for badges and quiet highlights. */
          primarySoft: '#F6EDE5',

          /* Sage green — "THRIFT STORE" in the logo. The closing band. */
          sage: '#5F6A4A',
          sageDark: '#4C5539',

          /* Warm sand, used for tints and quiet panels. */
          sand: '#FAF5EF',
          sandStrong: '#F1E7DA',

          /* The page itself: warm off-white rather than cold grey. */
          canvas: '#FBF8F3',

          /* Warm black — the "Adonai" wordmark. Text and the hero band. */
          ink: '#2B241D',
          night: '#211C16',

          /* Supporting neutrals, all warmed to match. */
          muted: '#726357',
          line: '#E8DFD3',
          skeleton: '#EFE9E0',
          skeletonDark: '#DCD3C6',

          /*
           * Brick red, used for one job only: the two buttons that destroy
           * something (delete a piece, replace the catalogue from a backup).
           *
           * It is not a logo colour, and that is the point — "Delete" must not
           * look like the copper "Save" beside it. It is mixed warm and dark to
           * sit with the rest of the palette, and it is measured: white text on
           * it is 7.55:1, and it reads at 7.13:1 on the page background, so it
           * clears AA in both directions.
           */
          danger: '#8C3B2E',
          dangerDark: '#743023',
        },
      },
      boxShadow: {
        card: '0 4px 14px #16141f0f',
      },
    },
  },
  plugins: [],
}
