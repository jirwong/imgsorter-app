/** @type {import('lint-staged').Config} */
export default {
  '*.{ts,tsx,js,mjs}': ['prettier --write', 'oxlint --fix'],
  '*.{json,yml,css,md}': ['prettier --write'],
};
