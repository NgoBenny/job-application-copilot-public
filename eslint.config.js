import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Only src/platform/registry.ts (the composition root) may import an adapter.
const noAdapterImports = {
  'no-restricted-imports': ['error', { patterns: [{ group: ['**/adapters/*', '**/adapters/**'], message: 'Only src/platform/registry.ts may import adapters.' }] }],
};

export default tseslint.config(
  { ignores: ['.output/**', '.wxt/**', 'node_modules/**', 'test-results/**', 'playwright-report/**', 'course/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, chrome: 'readonly' } } },
  { files: ['*.config.*', 'tests/**'], languageOptions: { globals: globals.node } },
  { files: ['**/*.tsx'], plugins: { 'react-hooks': reactHooks }, rules: reactHooks.configs.recommended.rules },
  { files: ['src/domain/**', 'src/features/**', 'src/platform/**', 'src/browser/**', 'src/ui/**', 'entrypoints/**'], ignores: ['src/platform/registry.ts'], rules: noAdapterImports },
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] } },
);
