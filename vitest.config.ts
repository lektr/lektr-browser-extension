import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      'wxt/storage': path.resolve(__dirname, './utils/__mocks__/wxt-storage.ts'),
    },
  },
  test: {
    environment: 'node',
  },
});
