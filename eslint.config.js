import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // ponytail: js/, www/, dan android/ adalah classic script browser (52 tag
  // <script>, nol type="module") yang saling berbagi global antar-file, plus
  // js/lib/*.min.js yang sudah di-minify. Di-lint dengan sourceType module
  // mereka jadi ~16k error no-undef yang semuanya artefak, bukan bug. Area ini
  // diabaikan agar gerbang lint benar-benar berguna untuk kode yang kita
  // ubah (server/, scripts/, src/). Naikkan kalau legacy ini dimigrasi ke ESM.
  globalIgnores([
    'dist',
    'js/**',
    'www/**',
    'android/**',
    'public/build/**',
  ]),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  // server/ adalah ESM Node (Express + pg + node:test), bukan browser. Tanpa
  // override ini ia hanya dapat globals.browser, jadi process/Buffer/setImmediate
  // dilaporkan no-undef padahal itu builtin yang sah. scripts/ juga Node
  // (ESM + createRequire untuk node:sqlite), jadi dapat perlakuan sama.
  {
    files: ['server/**/*.js', 'scripts/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
