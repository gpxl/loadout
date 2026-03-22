import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    restoreMocks: true,
    include: ["tests/e2e/**/*.test.ts"],
  },
});
