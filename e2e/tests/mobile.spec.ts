/**
 * The phone, in a real browser with a real layout engine.
 *
 * These exist because the component tests could not have caught what the owner
 * reported. jsdom parses CSS but computes no layout: it does not know that a
 * flex child refused to shrink, that `overflow: hidden` clipped a list, or that
 * an animation's fill beat a width declaration in the cascade. Every one of
 * those was green in the unit suite while being visibly broken on a phone, and
 * a test that cannot see the fault is not a test of it.
 *
 * So each assertion here is a measurement, not a query. "The menu is visible"
 * means the last item's box is inside the viewport; "the assistant fills the
 * width" means its measured width equals the screen's. Written against the
 * faults as reported, and each was checked against the old code first to
 * confirm it failed there.
 */
import { OWNER, expect, test } from "./fixtures";

/* An iPhone 13/14 and a common mid-range Android, the two shapes that matter. */
const IPHONE = { width: 390, height: 844 };
const ANDROID = { width: 360, height: 800 };

test.describe.configure({ mode: "serial" });

/** Signs in through the form, exactly as the desktop suite does. */
async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/");

  // The company may not exist yet: this file can run before or after the
  // desktop suite, and neither may depend on the other having gone first.
  const setup = page.getByLabel("Company name");
  if (await setup.isVisible().catch(() => false)) {
    await setup.fill(OWNER.companyName);
    await page.getByLabel("Company address").fill(OWNER.companySlug);
    await page.getByLabel("Your name").fill(OWNER.name);
    await page.getByLabel("Email").fill(OWNER.email);
    await page.getByLabel("Password").fill(OWNER.password);
    await page.getByRole("button", { name: /create|start|set up|continue/iu }).click();
  } else if (await page.getByLabel("Password").isVisible().catch(() => false)) {
    await page.getByLabel("Email").fill(OWNER.email);
    await page.getByLabel("Password").fill(OWNER.password);
    await page.getByRole("button", { name: /sign in|log in|continue/iu }).click();
  }

  // The work area exists only once the shell has rendered for a signed-in
  // person, so waiting on it is waiting on the sign-in having actually landed.
  await expect(page.locator("#main-content")).toBeVisible({ timeout: 30_000 });
}

test("the menu fills the canvas and every item can be reached", async ({ page }) => {
  await page.setViewportSize(IPHONE);
  await signIn(page);

  await page.getByRole("button", { name: /open menu/iu }).click();

  const sheet = page.getByRole("dialog", { name: /main/iu });
  await expect(sheet).toBeVisible();

  /*
   * The reported fault: the items were clipped away by the rail's
   * `overflow: hidden` because the column could not shrink, so everything past
   * the fold existed in the DOM and nowhere on the screen. Asserting on the
   * LAST item is the point — the first was always fine.
   */
  const items = sheet.getByRole("link");
  const count = await items.count();
  expect(count).toBeGreaterThan(0);

  /*
   * The reachability check, and it deliberately does NOT call
   * `scrollIntoViewIfNeeded` first. That was the first version of this test and
   * it could not fail: Playwright's scroll helper reaches an element inside an
   * `overflow: hidden` box perfectly well by setting scrollTop directly, so
   * restoring the exact clipping bug the owner reported left the test green.
   *
   * What a person has is a finger. So this asks the question a finger asks: is
   * there a scrollable ancestor that can actually bring this item into view? A
   * clipped list has no scrollable ancestor — `overflow: hidden` cannot be
   * scrolled by touch — and the item below the fold is unreachable no matter
   * what scrollTop says.
   */
  /*
   * The list is forced past the height of the screen first.
   *
   * With the seven features this instance has, the rail comfortably fits an
   * 844px phone, so no amount of broken overflow could hide anything and the
   * break-test proving that came back green — a check that cannot fail. A real
   * company enables more features than a fresh instance has, and the fault the
   * owner reported is precisely what happens when the list outgrows the sheet.
   * Growing it here reproduces that condition deterministically instead of
   * waiting for a customer to have enough menu items.
   */
  await sheet.evaluate((node) => {
    const list = node.querySelector(".rect-nav__list");
    const template = list?.lastElementChild;
    if (!list || !template) return;
    // Enough to overflow any phone: each row is ~44px, so 40 rows is ~1760px.
    for (let index = 0; index < 40; index += 1) {
      list.append(template.cloneNode(true));
    }
  });

  const overflows = await sheet.evaluate((node) => {
    const links = node.querySelectorAll("a");
    const item = links[links.length - 1] as HTMLElement;
    return item.getBoundingClientRect().bottom > window.innerHeight;
  });
  expect(overflows).toBe(true);

  const grown = sheet.getByRole("link");
  const last = grown.nth((await grown.count()) - 1);

  const reachable = await last.evaluate((node) => {
    const item = node as HTMLElement;
    const viewportHeight = window.innerHeight;
    const alreadyVisible = item.getBoundingClientRect().bottom <= viewportHeight;
    if (alreadyVisible) return true;

    for (let el = item.parentElement; el; el = el.parentElement) {
      const style = getComputedStyle(el);
      const scrolls = /auto|scroll/u.test(`${style.overflowY}`);
      if (scrolls && el.scrollHeight > el.clientHeight + 1) return true;
    }
    return false;
  });
  expect(reachable).toBe(true);

  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();

  // And it is genuinely operable, not merely painted.
  await expect(last).toBeEnabled();

  /*
   * In the canvas rather than over the shell. `#main-content` is the work area,
   * so a sheet inside it is part of the page instead of a window on top of it.
   */
  const insideCanvas = await sheet.evaluate((node) => Boolean(node.closest("#main-content")));
  expect(insideCanvas).toBe(true);

  // No portal root: it is not a window at all any more.
  expect(await page.locator("[data-overlay-root]").count()).toBe(0);
});

test("the assistant fills the whole width of the screen", async ({ page }) => {
  await page.setViewportSize(IPHONE);
  await signIn(page);

  await page.getByRole("button", { name: /open ai panel/iu }).click();

  const sheet = page.getByRole("dialog", { name: /ai assistant|مساعد/iu });
  await expect(sheet).toBeVisible();

  /*
   * The reported fault, measured. The panel kept its desktop column width
   * because its entry animation fills `width` and an animation's fill outranks
   * a normal declaration — so the sheet's `width: 100%` never applied. A
   * measurement is the only thing that could have caught that.
   */
  const box = await sheet.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(IPHONE.width - 2);

  const panel = sheet.locator(".rect-ai-panel");
  const panelBox = await panel.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(panelBox!.width).toBeGreaterThanOrEqual(IPHONE.width - 4);
});

test("the assistant's composer stays on screen, not pushed off the bottom", async ({ page }) => {
  await page.setViewportSize(IPHONE);
  await signIn(page);

  await page.getByRole("button", { name: /open ai panel/iu }).click();
  const sheet = page.getByRole("dialog", { name: /ai assistant|مساعد/iu });
  await expect(sheet).toBeVisible();

  /*
   * Either the assistant is configured and there is a composer, or it is not
   * and the panel explains why. Both are correct; what must never happen is a
   * composer that has slid off the bottom of the screen. The test asserts
   * whichever state the instance is in rather than requiring a model to be
   * connected, because a provider key is not something an E2E run should need.
   */
  const composer = sheet.getByLabel(/ask rectangle ai/iu);
  if (await composer.isVisible().catch(() => false)) {
    await expect(composer).toBeInViewport();
  } else {
    // The honest unavailable state, which must also be on screen.
    await expect(sheet.getByRole("status").first()).toBeInViewport();
  }
});

test("only one sheet is open at a time", async ({ page }) => {
  await page.setViewportSize(ANDROID);
  await signIn(page);

  await page.getByRole("button", { name: /open menu/iu }).click();
  await expect(page.getByRole("dialog", { name: /main/iu })).toBeVisible();

  // Two full-canvas surfaces cannot both be the canvas.
  expect(await page.getByRole("dialog").count()).toBe(1);

  /*
   * `force` because the sheet plays a short entry animation and Playwright's
   * stability check can outlast a 60s timeout waiting for a transform to settle
   * on a slow container. The click itself is what is under test here, not the
   * motion, and the animation is asserted elsewhere by its own absence under
   * reduced motion.
   */
  await page.getByRole("button", { name: /^close$/iu }).click({ force: true });
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the header stays reachable while a sheet is open", async ({ page }) => {
  await page.setViewportSize(IPHONE);
  await signIn(page);

  await page.getByRole("button", { name: /open menu/iu }).click();
  await expect(page.getByRole("dialog", { name: /main/iu })).toBeVisible();

  /*
   * The difference between a sheet in the canvas and a window over everything.
   * A window covers the header; this must not, because the header is how the
   * person knows where they are and how they got here.
   */
  await expect(page.getByRole("banner")).toBeInViewport();
});

test("the search field stays visible when the keyboard would cover it", async ({ page }) => {
  await page.setViewportSize(IPHONE);
  await signIn(page);

  await page.getByRole("button", { name: /search/iu }).first().click();

  // The global search field is a combobox: it owns the result list beneath it.
  const field = page.getByRole("dialog").getByRole("combobox");
  await expect(field).toBeVisible();
  await field.click();

  /*
   * A headless browser has no on-screen keyboard, so the keyboard itself cannot
   * be summoned here. What CAN be verified is that the mechanism is wired: the
   * property the layout reads exists, and the surface consumes it. Simulating a
   * 300px keyboard by setting the property proves the layout responds — which
   * is the part that was missing entirely, and the part that would break.
   */
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--rect-keyboard-inset", "300px");
  });

  await expect(field).toBeInViewport();

  /*
   * Measured on the scrim that actually holds the visible dialog, not the
   * first `.rect-overlay` in the document — a closed window can still be in
   * the tree mid-exit, and measuring that one reads a padding nobody can see.
   *
   * The allowance is added to the window's ordinary margin, so the assertion is
   * "grew by 300", not "is exactly 300". Pinning the absolute value would break
   * the test the moment somebody changed the margin token, for a reason that
   * has nothing to do with keyboards.
   */
  const scrim = page.locator(".rect-overlay").filter({ has: page.getByRole("dialog") });

  /*
   * Polled rather than read once. The padding is transitioned over 120ms so
   * that the window glides clear of the keyboard instead of jumping, which
   * means an immediate read returns the value it is animating *from* — the
   * first version of this test measured 12px and reported the feature broken
   * when it was working.
   */
  const paddingBottom = () =>
    scrim.first().evaluate((node) => Number.parseFloat(getComputedStyle(node).paddingBottom));

  await expect.poll(paddingBottom).toBeGreaterThan(300);

  const padded = await paddingBottom();

  await page.evaluate(() => {
    document.documentElement.style.setProperty("--rect-keyboard-inset", "0px");
  });
  await expect.poll(paddingBottom).toBeLessThan(100);
  const bare = await paddingBottom();

  expect(padded - bare).toBeCloseTo(300, 0);
});

test("nothing overflows the width of the screen", async ({ page }) => {
  await page.setViewportSize(ANDROID);
  await signIn(page);

  /*
   * A horizontal scrollbar on a phone is always a bug: it means something is
   * wider than the screen, and on a touch device it makes vertical scrolling
   * feel broken. Checked at the narrower of the two viewports, where it shows
   * up first.
   */
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
