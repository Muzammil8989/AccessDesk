import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';

const TS_FILES = ['**/*.{ts,tsx}'];
const PLAIN_JS_FILES = ['**/*.{js,mjs,cjs}'];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/test-results/**',
      'apps/api/src/generated/**',
    ],
  },
  js.configs.recommended,

  // TypeScript, with type information. It catches forgotten awaits, promises passed where a
  // plain value is expected, unsafe `any` flows and similar bugs that syntax-only linting misses.
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({ ...config, files: TS_FILES })),
  {
    files: TS_FILES,
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      // Fakes and interface-shaped functions are often `async` without needing `await`.
      '@typescript-eslint/require-await': 'off',
    },
  },
  // Plain JavaScript files (scripts, config, e2e) have no type information.
  { files: PLAIN_JS_FILES, ...tseslint.configs.disableTypeChecked },

  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  // Production code logs through the logger. console is fine in scripts, seeds and tests.
  {
    files: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.ts'],
    rules: { 'no-console': ['error', { allow: ['warn', 'error'] }] },
  },

  {
    // Renderer code runs in a browser context. Accessibility rules apply to its JSX.
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['apps/desktop/src/renderer/**/*.tsx'],
    ...jsxA11y.flatConfigs.recommended,
  },
  {
    files: ['apps/desktop/test/unit/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // E2E scripts run in Node, but the functions passed to page.evaluate() run in the browser.
    files: ['apps/desktop/test/e2e/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },

  // Architecture boundaries: keep the layers apart so each can change on its own.
  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/src/main/**', '**/main/**', 'electron', 'node:*'],
              message:
                'The renderer is sandboxed. It talks to the main process through window.accessdesk only.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/desktop/src/main/**/*.ts', 'apps/desktop/src/preload/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/renderer/**'],
              message: 'Main and preload code must not depend on UI code.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/desktop/**'], message: 'The API must not depend on the desktop app.' },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/apps/**'], message: 'Shared packages must not depend on applications.' },
          ],
        },
      ],
    },
  },

  {
    // Keep every Keycloak Admin call inside packages/keycloak-client
    files: ['apps/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/\\/admin\\/realms/]',
          message: 'Keycloak Admin API calls belong in packages/keycloak-client only.',
        },
        {
          selector: 'TemplateElement[value.raw=/\\/admin\\/realms/]',
          message: 'Keycloak Admin API calls belong in packages/keycloak-client only.',
        },
      ],
    },
  },

  {
    files: ['**/test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
      // Fake fetch implementations receive URL | string | Request and just stringify it.
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  },

  prettier,
);
