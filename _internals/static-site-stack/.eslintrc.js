module.exports = {
  env: {
    es2021: true,
    'jest/globals': true,
  },
  extends: [
    'airbnb-base',
  ],
  ignorePatterns: [
    './node_modules',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: [
    '@typescript-eslint',
    'cdk',
    'jest',
  ],
  rules: {
    'no-new': 'off',
    'import/extensions': 'off',
  },
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.ts'],
      },
    },
  },
};
