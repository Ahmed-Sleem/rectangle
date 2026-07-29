import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    restoreMocks: true,
    /*
     * One test file at a time.
     *
     * The migration suites each hold a PGlite instance — a whole PostgreSQL
     * compiled to WASM — and running files concurrently puts several in memory
     * at once. On a constrained machine the worker is then killed part way
     * through, which vitest reports as an unhandled error beside a summary that
     * still looks green: tests stop being counted rather than failing.
     */
    fileParallelism: false,
  },
});
