import { defineConfig } from 'vitest/config'

// Тесты базы: нужен запущенный локальный Supabase (`npm run db:start`).
export default defineConfig({
  test: {
    include: ['tests/db/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
})
