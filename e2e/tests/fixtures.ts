/**
 * One running product, shared by every test in the file.
 *
 * Starting it per test would be honest but would spend most of a minute on
 * migrations for each assertion. It is started once, and the tests are ordered
 * so that the state each leaves behind is state the next legitimately expects —
 * a company exists after setup, and a project exists after it is created.
 */
import { test as base } from "@playwright/test";
// @ts-expect-error -- the harness is plain JavaScript so it can be run directly
// with node for diagnosis, without a TypeScript loader in the way.
import { startStack } from "../server.mjs";

export interface Stack {
  baseUrl: string;
  migrationCount: number;
  stop: () => Promise<void>;
}

let stack: Stack | null = null;

/**
 * Started once per worker and stopped when the worker finishes.
 *
 * The teardown used to be a `test.afterAll`, which reads as "after all the
 * tests" and is in fact "after all the tests IN THIS FILE". With one spec file
 * the two were indistinguishable; adding a second made the difference a
 * failure, because the first file to finish shut the product down and every
 * test in the next one hit a refused connection. Playwright runs a
 * worker-scoped fixture's teardown when the worker exits, which is what was
 * meant all along, so the lifetime is expressed there instead of in a hook
 * whose name suggests a scope it does not have.
 */
export const test = base.extend<Record<string, never>, { stack: Stack }>({
  stack: [
    async ({}, use) => {
      stack ??= (await startStack()) as Stack;
      await use(stack);
      // Everything after `use` runs at worker teardown, not after each file.
      if (stack) {
        await stack.stop();
        stack = null;
      }
    },
    { scope: "worker" },
  ],
  baseURL: async ({ stack }, use) => {
    await use(stack.baseUrl);
  },
});

export { expect } from "@playwright/test";

/** The first owner, created by the setup test and used by the rest. */
export const MEMBER = {
  email: "planner@e2e.test",
  password: "PlannerPass77Delta",
};

export const OWNER = {
  companyName: "Rectangle E2E Contracting",
  companySlug: "rectangle-e2e",
  name: "Ahmed Owner",
  email: "owner@e2e.test",
  password: "CorrectHorse42Battery",
};
