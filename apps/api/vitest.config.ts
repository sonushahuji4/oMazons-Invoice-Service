import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    environment: 'node',
    globals: false,
    reporters: 'default',
  },
  resolve: {
    alias: {
      '@inv/shared': new URL('../../packages/shared/src/index.ts', import.meta.url).pathname,
    },
  },
});
