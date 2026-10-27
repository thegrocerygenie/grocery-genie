import expoConfig from 'eslint-config-expo/flat.js';

export default [
  ...expoConfig,
  {
    rules: {
      'no-console': 'warn',
    },
  },
  {
    // Config plugins run in Node at prebuild.
    files: ['plugins/**/*.js'],
    languageOptions: { globals: { __dirname: 'readonly' } },
  },
  {
    ignores: ['node_modules/', '.expo/', 'ios/', 'android/'],
  },
];
