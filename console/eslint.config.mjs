// eslint-config-next 16 ships flat configs; ESLint 10 removed the eslintrc
// compatibility layer FlatCompat depended on, so the presets are imported directly.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: ['.next/**', 'node_modules/**', '.data/**', '.test-build/**', 'next-env.d.ts'],
  },
];

export default eslintConfig;
