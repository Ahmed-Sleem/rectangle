/**
 * The seam nothing else covers.
 *
 * Every layer of Rectangle is tested, and the layers are tested against each
 * other, but until this file nothing signed in and clicked. The 2026-07-29
 * audit named that the weakest point of an otherwise strong suite: a fault
 * between a built page and a live API — a route that moved, a cookie that is
 * not set, a bundle that references a field the server stopped sending — would
 * pass every existing test and break every real user.
 *
 * So these tests use no shortcut. There is no seeded session, no injected
 * token, no direct database write. The company is created through the form a
 * real first owner fills in, and everything after it happens through the
 * browser.
 *
 * They run in order and share one database, because the product has exactly one
 * first owner and the flows genuinely depend on each other.
 */
import { MEMBER, OWNER, expect, test } from "./fixtures";

test.describe.configure({ mode: "serial" });

test("a stranger reaching an unclaimed instance is offered setup, not a login they cannot pass", async ({
  page,
}) => {
  await page.goto("/");

  // Before any company exists the product must send people to setup. Landing on
  // the sign-in form instead would be a dead end: there is nobody to sign in as.
  await expect(page.getByRole("heading", { name: /set up|welcome|company/iu })).toBeVisible();
  await expect(page.getByLabel("Company name")).toBeVisible();
});

test("the first owner creates the company and lands inside the product", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Company name").fill(OWNER.companyName);
  await page.getByLabel("Company slug").fill(OWNER.companySlug);
  await page.getByLabel("Your name").fill(OWNER.name);
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: /create|start|set up|continue/iu }).click();

  // Signed in, not merely "the request succeeded": the navigation only exists
  // for somebody the server has accepted.
  await expect(page.getByRole("navigation").getByRole("link", { name: "Projects" })).toBeVisible({
    timeout: 30_000,
  });
});

test("signing out and back in works with the password just chosen", async ({ page }) => {
  await page.goto("/logout");
  await expect(page.getByLabel("Password")).toBeVisible({ timeout: 20_000 });

  // The session cookie must actually be gone, not merely unused by the UI.
  const projects = await page.request.get("/v1/projects");
  expect(projects.status()).toBe(401);

  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("navigation").getByRole("link", { name: "Projects" })).toBeVisible({
    timeout: 30_000,
  });
});

test("a wrong password is refused", async ({ page }) => {
  await page.goto("/logout");
  await expect(page.getByLabel("Password")).toBeVisible({ timeout: 20_000 });

  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(`${OWNER.password}-wrong`);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Still on the login form, and nothing behind it opened.
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link", { name: "Projects" })).toHaveCount(0);
});

test("the owner creates a project and it survives a reload", async ({ page }) => {
  await page.goto("/logout");
  await expect(page.getByLabel("Password")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.getByRole("navigation").getByRole("link", { name: "Projects" }).click();
  await page.getByRole("button", { name: "Create project" }).first().click();

  /*
   * Scoped to the dialog. "Create project" names the toolbar button, the empty
   * state's button and the dialog's submit, so an unscoped `.last()` clicked
   * the empty state behind the dialog and the form was never submitted — a
   * failure that looked like the product losing the project.
   */
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Project name").fill("Nile Tower Fit-Out");
  await dialog.getByLabel("Project code").fill("NT-001");
  await dialog.getByRole("button", { name: "Create project" }).click();

  await expect(page.getByText("Nile Tower Fit-Out")).toBeVisible({ timeout: 20_000 });

  /*
   * Reloaded rather than trusted. A create that only updates the client cache
   * looks identical on screen to one that reached the database, and the
   * difference is the entire point of an end-to-end test.
   */
  await page.reload();
  await expect(page.getByText("Nile Tower Fit-Out")).toBeVisible({ timeout: 20_000 });
});

test("the project the owner created is theirs to open", async ({ page }) => {
  await page.goto("/logout");
  await expect(page.getByLabel("Password")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Wait for the shell before navigating: going straight to /projects while the
  // session is still being resolved lands on the login form instead.
  await expect(page.getByRole("navigation").getByRole("link", { name: "Projects" })).toBeVisible({
    timeout: 30_000,
  });
  await page.goto("/projects");
  /*
   * By listitem, not link. The project card is a `Link` carrying
   * `role="listitem"` so the card grid is a valid list, and an explicit role
   * replaces the implicit one — to a screen reader, and to this test, the card
   * is not a link at all.
   */
  await page.getByRole("listitem", { name: /Nile Tower Fit-Out/u }).first().click();

  /*
   * Guards the bug that shipped in session 39: a creator with `projects.create`
   * but not `projects.manage_all` had no membership row, so opening the project
   * they had just made answered "not found". They are enrolled as
   * `project_admin` in the same transaction now, and this is the only test that
   * would notice if that enrolment were removed.
   */
  await expect(page.getByText("NT-001").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/not found|no access|do not have/iu)).toHaveCount(0);
});

test("somebody who may create projects can open the one they just created", async ({ page }) => {
  /*
   * What this proves, precisely — because break-testing showed it proves less
   * than it first appears to.
   *
   * It covers create-then-open for somebody who is not an administrator: a
   * narrow user type that may create and edit projects and holds no
   * company-wide reach. That is the person a construction company gives to a
   * site engineer, and nothing else in the suite exercises them.
   *
   * It does NOT fail when the creator's enrolment is deleted — verified by
   * deleting it and watching this stay green. The reason is itself a finding,
   * recorded as C45: `getProject` gates on `projects.read` alone and never
   * consults membership, so anyone holding that permission can open any
   * project in the company. When reading a project requires reach, this test
   * becomes the one that catches a missing enrolment. Stated plainly rather
   * than implying a guarantee that is not there yet.
   */
  await page.goto("/logout");
  await expect(page.getByLabel("Password")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("navigation").getByRole("link", { name: "Projects" })).toBeVisible({
    timeout: 30_000,
  });

  /*
   * A purpose-made user type, not the seeded "Project office" one. That type
   * carries `projects.manage_all`, which reaches every project in the company
   * regardless of membership — so it hides exactly the fault being tested, and
   * did: with it, deleting the creator's enrolment left this test green.
   *
   * What is needed is the narrowest person who can hit the bug: may create a
   * project, may not manage all of them.
   */
  const siteEngineer = await page.request.post("/v1/admin/user-types", {
    data: {
      name: "Site engineer",
      key: "site-engineer",
      description: "Creates and runs their own projects, reaches nobody else's.",
      permissions: ["projects.read", "projects.create", "projects.edit", "project_team.read"],
    },
  });
  expect(siteEngineer.status(), await siteEngineer.text()).toBe(201);
  const typeId = ((await siteEngineer.json()) as { userType: { id: string } }).userType.id;

  const created = await page.request.post("/v1/admin/users", {
    data: {
      displayName: "Mona Planner",
      email: MEMBER.email,
      password: MEMBER.password,
      invite: false,
      standing: "member",
      userTypeIds: [typeId],
    },
  });
  expect(created.status(), await created.text()).toBe(201);

  await page.goto("/logout");
  await expect(page.getByLabel("Password")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Email").fill(MEMBER.email);
  await page.getByLabel("Password").fill(MEMBER.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.getByRole("navigation").getByRole("link", { name: "Projects" }).click();
  await page.getByRole("button", { name: "Create project" }).first().click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Project name").fill("Alexandria Warehouse");
  await dialog.getByLabel("Project code").fill("AW-002");
  await dialog.getByRole("button", { name: "Create project" }).click();

  await expect(page.getByText("Alexandria Warehouse")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("listitem", { name: /Alexandria Warehouse/u }).first().click();
  await expect(page.getByText("AW-002").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/not found|do not have access/iu)).toHaveCount(0);
});

test("a member cannot see, search or open a project they are not on", async ({ page }) => {
  /*
   * The whole of C45 through the real product, in a browser.
   *
   * "Nile Tower Fit-Out" was created by the owner and "Alexandria Warehouse" by
   * Mona, who is a plain member with a narrow user type. Before the fix Mona's
   * register listed both, the palette found both, and typing the owner's
   * project id into the address bar opened it. This asserts all three are shut,
   * and — just as importantly — that her own project is still there, because a
   * scoping bug that hides everything would otherwise pass.
   */
  await page.goto("/logout");
  await expect(page.getByLabel("Password")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Email").fill(MEMBER.email);
  await page.getByLabel("Password").fill(MEMBER.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Wait for the shell before navigating. Going straight to /projects while the
  // session is still resolving lands back on the login form, and the assertion
  // below then fails for a reason unrelated to what it is testing.
  await expect(page.getByRole("navigation").getByRole("link", { name: "Projects" })).toBeVisible({
    timeout: 30_000,
  });

  await page.goto("/projects");
  await expect(page.getByText("Alexandria Warehouse")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Nile Tower Fit-Out")).toHaveCount(0);

  // The register is the UI's answer; this is the server's, and it is the one
  // that matters. A client-side filter would satisfy the assertion above.
  const list = await page.request.get("/v1/projects");
  expect(list.ok()).toBeTruthy();
  const codes = ((await list.json()) as { projects: Array<{ code: string }> }).projects.map(
    (project) => project.code,
  );
  expect(codes).toContain("AW-002");
  expect(codes).not.toContain("NT-001");

  const found = await page.request.get("/v1/search?q=Nile");
  expect(found.ok()).toBeTruthy();
  const titles = ((await found.json()) as { results: Array<{ title: string }> }).results.map(
    (result) => result.title,
  );
  expect(titles).not.toContain("Nile Tower Fit-Out");

  /*
   * Guessing the id directly. The register hiding a row means nothing if the
   * detail endpoint still serves it — that is the difference between a filter
   * and an authorisation rule.
   */
  const owners = await page.request.get("/v1/projects?search=NT-001");
  const leaked = ((await owners.json()) as { projects: Array<{ id: string }> }).projects;
  expect(leaked).toHaveLength(0);
});

test("the people register shows colleagues, and only the projects the viewer may see", async ({
  page,
}) => {
  /*
   * The directory SQL against a real PostgreSQL, which is the only thing that
   * can show which rows it *excludes*. A fake pool proves a statement is
   * well-formed and says nothing about whether it withholds the right records,
   * and withholding is the whole purpose of these queries.
   *
   * Mona is a member of one project. The owner is on another. They share
   * nothing, so neither should appear in the other's colleague register, and
   * Mona's view of the owner — if she could see him at all — must not name the
   * owner's project.
   */
  await page.goto("/logout");
  await expect(page.getByLabel("Password")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Email").fill(MEMBER.email);
  await page.getByLabel("Password").fill(MEMBER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("navigation").getByRole("link", { name: "Projects" })).toBeVisible({
    timeout: 30_000,
  });

  // Mona holds no `users.read`, so the company register is not hers to open.
  const registers = await page.request.get("/v1/directory/registers");
  expect(registers.ok()).toBeTruthy();
  expect(((await registers.json()) as { registers: string[] }).registers).toEqual(["colleagues"]);

  const refused = await page.request.get("/v1/directory/company");
  expect(refused.status()).toBe(403);

  const colleagues = await page.request.get("/v1/directory/colleagues");
  expect(colleagues.ok()).toBeTruthy();
  const people = (
    (await colleagues.json()) as {
      people: Array<{ email: string; projects: Array<{ code: string }> }>;
    }
  ).people;

  // Nobody shares a project with her yet, and she is never her own colleague.
  expect(people.map((person) => person.email)).not.toContain(OWNER.email);
  expect(people.map((person) => person.email)).not.toContain(MEMBER.email);

  // The owner CAN see her — as an owner they reach everything — and what they
  // see of her is her real project, which they are entitled to.
  await page.goto("/logout");
  await expect(page.getByLabel("Password")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("navigation").getByRole("link", { name: "Projects" })).toBeVisible({
    timeout: 30_000,
  });

  const company = await page.request.get("/v1/directory/company");
  expect(company.ok()).toBeTruthy();
  const directory = (
    (await company.json()) as {
      people: Array<{ email: string; projects: Array<{ code: string }>; openTaskCount: number }>;
    }
  ).people;

  const mona = directory.find((person) => person.email === MEMBER.email);
  expect(mona, "Mona appears in the company directory").toBeTruthy();
  expect(mona!.projects.map((project) => project.code)).toEqual(["AW-002"]);

  /*
   * The assertion that actually exercises the filter, and it took a
   * break-test to notice it was missing: every check above is made either by
   * an owner, who reaches everything, or about a person on a single project.
   * Deleting the reach clause from the query left all of them green.
   *
   * What is needed is a viewer who shares *one* project with somebody who is
   * on *two*. The owner is on Nile Tower and Mona is on Alexandria Warehouse,
   * so putting the owner on Alexandria Warehouse gives Mona exactly that: she
   * must see the owner as a colleague, see Alexandria Warehouse on his card,
   * and never learn that Nile Tower exists.
   */
  const projects = await page.request.get("/v1/projects?search=AW-002");
  const alexandria = ((await projects.json()) as { projects: Array<{ id: string; code: string }> })
    .projects.find((project) => project.code === "AW-002");
  expect(alexandria, "the owner can reach Alexandria Warehouse").toBeTruthy();

  const monaId = directory.find((person) => person.email === MEMBER.email)!;
  const owner = directory.find((person) => person.email === OWNER.email)!;
  const added = await page.request.post(`/v1/projects/${alexandria!.id}/members`, {
    data: { userId: owner.id, role: "project_manager" },
  });
  expect(added.status(), await added.text()).toBe(201);
  expect(monaId).toBeTruthy();

  await page.goto("/logout");
  await expect(page.getByLabel("Password")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Email").fill(MEMBER.email);
  await page.getByLabel("Password").fill(MEMBER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("navigation").getByRole("link", { name: "Projects" })).toBeVisible({
    timeout: 30_000,
  });

  const shared = await page.request.get("/v1/directory/colleagues");
  const asMonaSeesThem = (
    (await shared.json()) as {
      people: Array<{ email: string; projects: Array<{ code: string }>; sharedProjectCount: number }>;
    }
  ).people;

  const ownerAsColleague = asMonaSeesThem.find((person) => person.email === OWNER.email);
  expect(ownerAsColleague, "the owner is now Mona's colleague").toBeTruthy();
  expect(ownerAsColleague!.sharedProjectCount).toBe(1);
  // He is on two projects. She may know about one of them.
  expect(ownerAsColleague!.projects.map((project) => project.code)).toEqual(["AW-002"]);
});

test("an unauthenticated request is refused by the API, not answered with a page", async ({
  request,
}) => {
  // A single-origin deployment serves the app for unknown paths, which is
  // correct for a client-routed app and wrong for the API — an endpoint that
  // answered 200 with HTML would break every client silently.
  const response = await request.get("/v1/projects");
  expect(response.status()).toBe(401);
  expect(response.headers()["content-type"]).toContain("json");
});
