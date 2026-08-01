import { defineConfig, devices } from "@playwright/test";

/**
 * The stack is started by the fixture rather than by `webServer`, because it is
 * a database and a server that have to come up in that order and be torn down
 * together. Playwright's own webServer option runs one command and knows
 * nothing about the database behind it.
 */
export default defineConfig({
  testDir: "./tests",
  /*
   * Serial. Every test in this suite shares one database and the first one
   * claims the instance by creating the company — there is exactly one first
   * owner, so a second worker racing for it would fail for a reason that has
   * nothing to do with the product.
   */
  workers: 1,
  fullyParallel: false,
  /*
   * No retries. A test that passes on the second attempt is a test nobody can
   * trust; the flake is the finding.
   */
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"]] : [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
