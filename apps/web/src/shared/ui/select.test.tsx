/**
 * The dropdown, tested through what a person actually does to it.
 *
 * The one thing worth stating about the subject under test: the value still
 * lives in a real `<select>`, hidden behind the trigger, because twenty-two of
 * the thirty dropdowns in this product are wired with `register()` and expect a
 * genuine form control. So the tests that matter most here are the ones that
 * submit a form — clicking an option and seeing the label change proves the
 * decoration, not the plumbing, and the plumbing is what would fail silently.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { Field } from "./primitives";
import { Select } from "./select";

function Colours(props: { onChange?: (value: string) => void; defaultValue?: string }) {
  return (
    <Select
      aria-label="Colour"
      defaultValue={props.defaultValue ?? "red"}
      onChange={(event) => props.onChange?.(event.target.value)}
    >
      <option value="red">Red</option>
      <option value="green">Green</option>
      <option value="blue">Blue</option>
    </Select>
  );
}

describe("Select", () => {
  it("shows the current choice without opening anything", () => {
    render(<Colours defaultValue="green" />);

    expect(screen.getByRole("combobox", { name: "Colour" })).toHaveTextContent("Green");
    // Nothing is rendered until it is asked for.
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("opens, offers every option, and reports the one chosen", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Colours onChange={onChange} />);

    await user.click(screen.getByRole("combobox", { name: "Colour" }));
    const list = await screen.findByRole("listbox");
    expect(within(list).getAllByRole("option")).toHaveLength(3);

    await user.pointer({ target: within(list).getByRole("option", { name: "Blue" }), keys: "[MouseLeft]" });

    expect(onChange).toHaveBeenCalledWith("blue");
    expect(screen.getByRole("combobox", { name: "Colour" })).toHaveTextContent("Blue");
    // Choosing dismisses it, as a native select does.
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  /*
   * THE ONE THAT MATTERS. A dropdown that looks right and submits nothing is
   * the failure this component was designed around, and it is invisible on
   * screen: the label updates, the option highlights, and the field arrives at
   * the server as undefined. It happened during this work — the caller's `ref`
   * from `register()` was overwritten by the component's own — and no test that
   * merely clicked an option could have caught it.
   */
  it("reaches react-hook-form, so the form actually submits the choice", async () => {
    const user = userEvent.setup();
    let submitted: { colour: string } | undefined;

    function Form() {
      const form = useForm<{ colour: string }>({ defaultValues: { colour: "red" } });
      return (
        <form onSubmit={form.handleSubmit((values) => { submitted = values; })}>
          <Select aria-label="Colour" {...form.register("colour")}>
            <option value="red">Red</option>
            <option value="blue">Blue</option>
          </Select>
          <button type="submit">Save</button>
        </form>
      );
    }

    render(<Form />);
    await user.click(screen.getByRole("combobox", { name: "Colour" }));
    const list = await screen.findByRole("listbox");
    await user.pointer({ target: within(list).getByRole("option", { name: "Blue" }), keys: "[MouseLeft]" });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(submitted).toEqual({ colour: "blue" }));
  });

  it("is driven entirely from the keyboard", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Colours onChange={onChange} />);

    const trigger = screen.getByRole("combobox", { name: "Colour" });
    trigger.focus();

    await user.keyboard("{ArrowDown}");
    expect(await screen.findByRole("listbox")).toBeInTheDocument();

    // red -> green, then committed.
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("green");

    // Focus comes back to the control, or the next Tab starts from nowhere.
    expect(trigger).toHaveFocus();
  });

  it("jumps to an option by its first letters", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Colours onChange={onChange} />);

    screen.getByRole("combobox", { name: "Colour" }).focus();
    await user.keyboard("{ArrowDown}");
    await screen.findByRole("listbox");

    await user.keyboard("bl{Enter}");

    expect(onChange).toHaveBeenCalledWith("blue");
  });

  it("closes on Escape without changing anything", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Colours onChange={onChange} />);

    const trigger = screen.getByRole("combobox", { name: "Colour" });
    await user.click(trigger);
    await screen.findByRole("listbox");

    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    // Arrowing moved the highlight, not the value.
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger).toHaveTextContent("Red");
  });

  it("will not open when it is disabled", async () => {
    const user = userEvent.setup();
    render(
      <Select aria-label="Colour" disabled defaultValue="red">
        <option value="red">Red</option>
      </Select>,
    );

    await user.click(screen.getByRole("combobox", { name: "Colour" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("skips an option nobody may choose", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select aria-label="Colour" defaultValue="red" onChange={(e) => onChange(e.target.value)}>
        <option value="red">Red</option>
        <option value="green" disabled>Green</option>
        <option value="blue">Blue</option>
      </Select>,
    );

    screen.getByRole("combobox", { name: "Colour" }).focus();
    await user.keyboard("{ArrowDown}");
    await screen.findByRole("listbox");

    // One press moves past the disabled row rather than stalling on it.
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith("blue");
  });

  /*
   * `Field` clones an id onto its child and points its label at it. The id has
   * to land on the trigger, because that is the control a person focuses — put
   * it on the hidden element and every field label in the product aims at
   * something invisible while the visible control has no name at all.
   */
  it("takes its name from the field label around it", () => {
    render(
      <Field label="Project status">
        <Select defaultValue="active">
          <option value="active">Active</option>
        </Select>
      </Field>,
    );

    expect(screen.getByRole("combobox", { name: "Project status" })).toBeInTheDocument();
  });

  it("announces itself as invalid when the field is", () => {
    render(
      <Field label="Project status" error="Pick one">
        <Select defaultValue="">
          <option value="">None</option>
        </Select>
      </Field>,
    );

    expect(screen.getByRole("combobox", { name: "Project status" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("follows a value changed from outside", async () => {
    function Controlled() {
      const [value, setValue] = useState("red");
      return (
        <>
          <Select aria-label="Colour" value={value} onChange={(event) => setValue(event.target.value)}>
            <option value="red">Red</option>
            <option value="blue">Blue</option>
          </Select>
          <button type="button" onClick={() => setValue("blue")}>
            Reset to blue
          </button>
        </>
      );
    }

    const user = userEvent.setup();
    render(<Controlled />);

    expect(screen.getByRole("combobox", { name: "Colour" })).toHaveTextContent("Red");
    await user.click(screen.getByRole("button", { name: "Reset to blue" }));

    // The trigger mirrors the element rather than holding its own copy, so a
    // value set by a parent — a form reset, a loaded record — is reflected.
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Colour" })).toHaveTextContent("Blue"),
    );
  });
});
