import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      '**/dist/**',
      '**/out/**',
      '**/node_modules/**',
      '**/*.js',
      '**/*.mjs',
      '**/*.cjs',
      '**/coverage/**',
      '**/.turbo/**',
      '**/__mocks__/**',
    ],
  },

  // Base JS recommended rules
  eslint.configs.recommended,

  // TypeScript files
  {
    files: ['packages/**/src/**/*.ts', 'packages/**/src/**/*.tsx'],
    extends: [...tseslint.configs.recommended],
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      // Phase 2: warn level — does not block CI, only reports
      'no-console': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // Immediately enforced as errors
      'no-debugger': 'error',

      // TypeScript handles these better than ESLint
      'no-undef': 'off',

      // Relaxed rules for existing codebase
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-case-declarations': 'off',
      'no-control-regex': 'off',
      'no-useless-escape': 'warn',
      'prefer-const': 'warn',
    },
  },

  // React hooks rules — applied to both .tsx and hook .ts files
  {
    files: ['packages/**/src/**/*.tsx', 'packages/**/src/**/use*.ts'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
