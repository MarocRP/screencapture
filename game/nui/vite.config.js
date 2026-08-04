/** @type {import('vite').UserConfig} */
export default {
  base: "./",
  build: {
    sourcemap: process.env.SENTRY_SOURCEMAPS === 'true',
  },
};
