import expoConfig from 'eslint-config-expo/flat.js';

export default [
  ...expoConfig,
  {
    rules: {
      'no-console': 'warn',
    },
  },
  {
    ignores: ['node_modules/', '.expo/', 'ios/', 'android/'],
  },
];
