module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname
  },
  env: {
    node: true,
    es2022: true
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier'
  ],
  rules: {
    '@typescript-eslint/no-misused-promises': [
      'error',
      {
        checksVoidReturn: false
      }
    ],
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        caughtErrors: 'none',
        caughtErrorsIgnorePattern: '^_',
        varsIgnorePattern: '^_|^[A-Z0-9_]+$'
      }
    ],
    '@typescript-eslint/no-empty-object-type': 'off',
    'import/no-unresolved': [
      'error',
      {
        ignore: ['^\\.\\.?/.*\\.js$']
      }
    ],
    'import/order': [
      'warn',
      {
        alphabetize: { order: 'asc', caseInsensitive: true },
        groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
        'newlines-between': 'always'
      }
    ]
  }
};
