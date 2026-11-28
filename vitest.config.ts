import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/api/src/**/*.test.ts", "apps/worker/src/**/*.test.ts"],
    environment: "node",
    globalSetup: ["./scripts/test-global-setup.ts"],
    // Los tests de integración comparten una base; se corren en serie para no pisarse.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
