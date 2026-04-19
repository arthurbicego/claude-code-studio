import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './web/src'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
  test: {
    include: ['{server,web/src,shared}/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    environment: 'node',
  },
});
