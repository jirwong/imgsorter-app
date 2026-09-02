/** @type {import('prettier').Config} */
export default {
  semi: true,
  endOfLine: 'lf',
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 120,
  overrides: [
    {
      files: 'package.json',
      options: { tabWidth: 2 },
    },
  ],
};
