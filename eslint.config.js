import js from '@eslint/js';
import globals from 'globals';

// Flat config ESLint 9.
// - server/, api/, tests/: Node + aturan ketat (error).
// - js/: arsitektur script-tag klasik — global bersama antar-file, jadi
//   no-undef/no-unused-vars memalsukan ribuan error. Vendor & salinan " 1.js" diabaikan.
export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'catalog/**',
      'public/**',
      'data/**',
      'db/**',
      'temp_qr*/**',
      'js/lib/**',
      '**/*.min.js',
      'js/**/* 1.js',
      'screenshots/**',
      'docker/**',
      'n8n/**',
      '.superpowers/**',
    ],
  },
  // Server & test: ketat.
  {
    files: ['server/**/*.js', 'api/**/*.js', 'tests/**/*.js', 'eslint.config.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-console': 'off',
    },
  },
  // Script browser non-module: no-undef/no-undef silakan, tapi jangan error
  // karena cross-file global ($, apiFetch, P, dst.).
  {
    files: ['js/**/*.js', 'tests/**/*.mjs'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-console': 'off',
    },
  },
];
