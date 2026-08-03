/**
 * Picking a value from the product's dropdown, in a test.
 *
 * `userEvent.selectOptions` only speaks to a native `<select>`, and the
 * dropdown is no longer one: it is a button and a portalled listbox, with the
 * real element kept hidden behind them so forms and validation still work. A
 * test calling `selectOptions` was therefore driving a control no person can
 * reach, which is the opposite of what these tests are for.
 *
 * This drives what a person drives — focus the trigger, open the list, click
 * the row — so the assertion covers the component as it actually ships. It
 * lives here, once, rather than in each test file: there are twenty-six call
 * sites, and twenty-six private copies of this would be the same duplication
 * the component itself was built to remove.
 */
import { screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/**
 * Chooses an option by its visible text.
 *
 * `trigger` is the control the label points at — whatever `getByLabelText` or
 * `getByRole("combobox")` returned. The option is looked up inside the open
 * listbox rather than the whole document, because the same words often appear
 * in the row behind the dropdown as well.
 */
export async function chooseOption(
  user: UserEvent,
  trigger: HTMLElement,
  label: string | RegExp,
): Promise<void> {
  await user.click(trigger);

  const listbox = await screen.findByRole("listbox");

  /*
   * By visible text first, and by the underlying option value as a fallback.
   *
   * Both because the tests that predate this component pass the value — the
   * argument `selectOptions` took — while a test written now naturally names
   * what is on screen. Supporting the value keeps that migration mechanical
   * and, more usefully, keeps those tests asserting through the real control
   * instead of being rewritten into something weaker to make them pass.
   */
  const byLabel = within(listbox).queryByRole("option", { name: label });
  const option =
    byLabel ??
    within(listbox)
      .getAllByRole("option")
      .find((row) => {
        const value = row.getAttribute("data-value") ?? "";
        return typeof label === "string" ? value === label : label.test(value);
      });

  if (!option) {
    const offered = within(listbox)
      .getAllByRole("option")
      .map((row) => `${row.getAttribute("data-value")} (${row.textContent})`)
      .join(", ");
    throw new Error(`No option matching ${String(label)}. The list offered: ${offered}`);
  }

  /*
   * `pointer`, not `click`. The component commits on pointerdown, because its
   * outside-click dismissal also runs on pointerdown and a click handler would
   * fire only after the popup had already gone.
   */
  await user.pointer({ target: option, keys: "[MouseLeft]" });
}
