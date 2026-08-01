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
    launchOptions: {
      /*
       * Chromium sizes its shared-memory file for a desktop and gives each
       * renderer its own process. On a small CI container that is enough to
       * have the kernel kill the worker mid-run — which reports as
       * "worker process exited unexpectedly (SIGKILL)" and looks like a flaky
       * test rather than the memory ceiling it is.
       *
       * `/dev/shm` is typically 64 MB in a container, so Chromium is told to
       * write that file to /tmp instead. Not `--single-process`: it does cut
       * memory, and it also crashed the browser on the second navigation of
       * every run — "Target page, context or browser has been closed" — so the
       * saving costs the suite.
       */
      args: ["--disable-dev-shm-usage", "--no-sandbox"],
    },
  },
});
