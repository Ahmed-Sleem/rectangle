/**
 * The one dropdown in the product.
 *
 * A native `<select>` cannot be styled. Its popup is drawn by the operating
 * system, so on Windows it is a grey Win32 list, on macOS a translucent sheet,
 * and on Android a full-screen modal — three different products inside one
 * screen, none of them reading the theme, none of them respecting the type
 * scale, and the closed control stretching to whatever width its container
 * gave it. That is what was reported: dropdowns that fill the space and look
 * like nothing else here.
 *
 * WHY THE NATIVE ELEMENT IS STILL HERE, AND WHY THAT IS THE WHOLE DESIGN.
 *
 * Twenty-two of the thirty dropdowns in this product are written as
 * `<Select {...form.register("status")} />`. React Hook Form's `register`
 * returns a `name`, an `onChange`, an `onBlur` and — critically — a `ref` that
 * it expects to be attached to a real form control. It reads `.value` off that
 * element when the form is submitted and when validation runs.
 *
 * Replacing the element with a `<div role="listbox">` would therefore have
 * broken all twenty-two silently: the forms would still render, still look
 * right, and submit nothing. So the native element stays and remains the single
 * source of truth. What is replaced is only what a person sees and touches.
 * The listbox writes its choice into the real `<select>` through the DOM's own
 * value setter and dispatches a genuine `change` event, which is exactly what
 * React and React Hook Form are already listening for.
 *
 * The consequence is the point of it: **no call site changes at all**. Every
 * existing `register()`, `value`/`onChange`, `disabled` and `aria-label`
 * behaves as it did, and the §0.3 question — to restyle every dropdown in the
 * product, how many files must be edited? — answers one.
 *
 * The popup is portalled to the body for the reason `UserMenu` documents: the
 * panel and its header both create stacking contexts, so a `z-index` set on a
 * descendant is resolved inside them and cannot rise above page content
 * whatever the value. Escaping to the body is the only fix that does not
 * require unpicking the shell's layering, and the trigger's rectangle is
 * measured on open and kept in step with scroll and resize.
 */
import { Check, ChevronDown } from "lucide-react";
import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/shared/lib/cn";
import "./select.css";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  /**
   * `inline` is for a dropdown sitting in a table row rather than in a form.
   *
   * The two want opposite things. A field in a form should fill its column, so
   * a row of inputs lines up down the page; a control in a table cell should be
   * only as wide as the value it shows, or one column of a dense table is given
   * over to whitespace and the row stops reading as a row. It is also quieter
   * at rest — a table with a bordered box in every row reads as a form somebody
   * has to fill in rather than a list they are looking at.
   */
  variant?: "field" | "inline";
  /**
   * The caller's own handle on the underlying element.
   *
   * Declared explicitly because this is not a `forwardRef` component and React
   * 19's attribute type does not carry `ref` on its own. It matters more here
   * than it usually would: `register()` passes a ref through, and it must reach
   * the real `<select>` or the field submits nothing at all.
   */
  ref?: React.Ref<HTMLSelectElement>;
}

/** One choice, read out of the `<option>` elements the caller already wrote. */
interface Choice {
  value: string;
  label: string;
  disabled: boolean;
}

/** Where the popup sits, in viewport coordinates. */
interface Anchor {
  top: number;
  /** Measured from the viewport's leading edge, resolved for the document's direction. */
  inlineStart: number;
  width: number;
  /** Set when the popup had to open upwards because there was no room below. */
  above: boolean;
}

/** Room the popup needs below the trigger before it flips above it. */
const MIN_SPACE_BELOW = 180;

/**
 * Reads the caller's `<option>` children into plain data.
 *
 * The options stay written as JSX at every call site — that is what keeps this
 * a drop-in replacement — but the popup cannot render them directly, because an
 * `<option>` outside a `<select>` has no meaning and no styling. So they are
 * flattened once and rendered twice: as real options inside the hidden native
 * element, and as rows in the listbox.
 */
function readChoices(children: ReactNode): Choice[] {
  const choices: Choice[] = [];

  const walk = (nodes: ReactNode) => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return;

      // `<optgroup>` is rare here but must not silently swallow its options.
      if (child.type === "optgroup") {
        walk((child.props as { children?: ReactNode }).children);
        return;
      }

      if (child.type !== "option") return;

      const props = child.props as {
        value?: string | number;
        children?: ReactNode;
        disabled?: boolean;
      };

      const value = props.value === undefined ? "" : String(props.value);
      const label = Children.toArray(props.children)
        .map((part) => (typeof part === "string" || typeof part === "number" ? String(part) : ""))
        .join("")
        .trim();

      choices.push({ value, label: label || value, disabled: Boolean(props.disabled) });
    });
  };

  walk(children);
  return choices;
}

export function Select({
  className,
  invalid,
  variant = "field",
  children,
  disabled,
  id,
  ref: forwardedRef,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "aria-required": ariaRequired,
  onChange,
  ...props
}: SelectProps) {
  const nativeRef = useRef<HTMLSelectElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  /*
   * Mirrors the native element's value so the trigger can render a label.
   *
   * Deliberately a mirror rather than the source: the `<select>` still owns the
   * value, and this is re-read from it whenever it changes, including when a
   * form resets it or a parent re-renders with a new `value` prop. Holding the
   * value here as the truth would be the second source this design exists to
   * avoid.
   */
  const [shown, setShown] = useState("");

  const choices = useMemo(() => readChoices(children), [children]);

  const syncFromNative = useCallback(() => {
    const node = nativeRef.current;
    if (node) setShown(node.value);
  }, []);

  // After every render, because a controlled `value` prop, a form reset and a
  // default selection all land on the element without any event being fired.
  useLayoutEffect(syncFromNative);

  const selected = choices.find((choice) => choice.value === shown);

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    // Flip upwards only when there is genuinely no room, so a dropdown near the
    // foot of a long form does not open off the bottom of the screen.
    const above = below < MIN_SPACE_BELOW && rect.top > below;

    setAnchor({
      top: above ? rect.top : rect.bottom,
      inlineStart: rect.left,
      // The popup is at least as wide as the control it belongs to, so the two
      // read as one object rather than as a menu that happens to be nearby.
      width: rect.width,
      above,
    });
  }, []);

  /*
   * Dismissal is immediate. There is no fade out, and that is deliberate.
   *
   * A popup kept mounted for the length of an exit animation is a popup that
   * exists while it is not usable, and it caused a real class of fault: reopen
   * within the fade and the stale list was still in the document, still
   * matching a query for a listbox, and carrying `pointer-events: none` — so
   * the control rendered but could not be picked from. Cancelling the timer on
   * reopen fixes one path and not the others; removing the state removes them
   * all.
   *
   * Nothing is lost visually. A menu that vanishes on click is what every
   * native select does, the entry animation is where the polish actually reads,
   * and 120ms of fade on dismissal is below the threshold at which anyone
   * reports missing it.
   */
  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  /**
   * Writes a choice into the real element.
   *
   * Through the prototype's own setter rather than `node.value = x`, because
   * React installs its own value setter on the instance to track changes; going
   * around it means React never learns the value moved, and a controlled
   * `<select>` would snap straight back to its prop on the next render. This is
   * the same technique React's own test utilities use.
   */
  const commit = useCallback((value: string) => {
    const node = nativeRef.current;
    if (!node) return;

    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    if (setter) setter.call(node, value);
    else node.value = value;

    // A real bubbling event, so `register()`, plain `onChange` handlers and any
    // future listener all see exactly what a mouse on a native select produces.
    node.dispatchEvent(new Event("change", { bubbles: true }));
    setShown(value);
  }, []);

  const openList = useCallback(() => {
    if (disabled) return;
    /*
     * Cancel any exit in flight. Reopening during the 120ms fade would
     * otherwise leave `data-state="closed"` on the popup, and the rule that
     * makes a dismissed list ignore clicks would apply to the one just opened —
     * a dropdown that renders but cannot be picked from. Found by a test that
     * opened the same control twice in quick succession, which is exactly what
     * an impatient person does.
     */
    measure();
    /*
     * Resolved here rather than during render, because the trigger is not in
     * the document on the first pass and `closest` would answer for nothing —
     * sending every popup to the body, including the ones that must not go
     * there.
     */
    setHost(
      (triggerRef.current?.closest("[data-overlay-root]") as HTMLElement | null) ?? document.body,
    );
    // Start on the current choice, so arrowing moves from where the person is
    // rather than from the top of a list they have already made a pick from.
    const at = choices.findIndex((choice) => choice.value === shown);
    setActiveIndex(at === -1 ? 0 : at);
    setOpen(true);
  }, [choices, disabled, measure, shown]);

  /* Keeps the popup attached to its trigger while the page moves underneath. */
  useEffect(() => {
    if (!open) return undefined;

    const onScrollOrResize = () => measure();
    // Capture, so scrolling any ancestor container counts and not only the page.
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [measure, open]);

  /* A click anywhere else closes it, exactly as a native popup does. */
  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (listRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [close, open]);

  /*
   * Type-ahead, which is the one native behaviour people notice missing.
   * Pressing "b" on a status list should land on "Blocked". The buffer clears
   * after a pause so "b" then "l" reads as "bl" while typing quickly, and as
   * two separate jumps when typed slowly.
   */
  const typed = useRef({ text: "", at: 0 });

  const jumpToTyped = useCallback(
    (key: string) => {
      const now = Date.now();
      typed.current.text = now - typed.current.at > 700 ? key : typed.current.text + key;
      typed.current.at = now;

      const prefix = typed.current.text.toLowerCase();
      const found = choices.findIndex(
        (choice) => !choice.disabled && choice.label.toLowerCase().startsWith(prefix),
      );
      if (found !== -1) setActiveIndex(found);
    },
    [choices],
  );

  const step = useCallback(
    (from: number, direction: 1 | -1) => {
      // Skips disabled rows, so holding an arrow key cannot stall on one.
      let next = from;
      for (let attempt = 0; attempt < choices.length; attempt += 1) {
        next = (next + direction + choices.length) % choices.length;
        if (!choices[next]?.disabled) return next;
      }
      return from;
    },
    [choices],
  );

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (!open) {
      // Enter, Space and either vertical arrow all open a native select too.
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        openList();
      } else if (event.key.length === 1) {
        /*
         * Typing on a closed native select changes the value without opening.
         * Matched here so the control behaves the same for somebody who never
         * opens it, which is how most keyboard users move through a form.
         */
        event.preventDefault();
        jumpToTyped(event.key);
        const now = typed.current.text.toLowerCase();
        const found = choices.find(
          (choice) => !choice.disabled && choice.label.toLowerCase().startsWith(now),
        );
        if (found) commit(found.value);
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((at) => step(at, 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((at) => step(at, -1));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(step(choices.length - 1, 1));
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(step(0, -1));
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        const choice = choices[activeIndex];
        if (choice && !choice.disabled) commit(choice.value);
        close(true);
        break;
      }
      case "Escape":
        event.preventDefault();
        // Stopped here so a dropdown inside a dialog does not also close the
        // dialog behind it — one Escape, one dismissal.
        event.stopPropagation();
        close(true);
        break;
      case "Tab":
        // Tab commits and moves on, as a native select does. Not prevented, so
        // focus still travels to the next control.
        close(false);
        break;
      default:
        if (event.key.length === 1) {
          event.preventDefault();
          jumpToTyped(event.key);
        }
    }
  };

  /* Keeps the highlighted row in view when arrowing through a long list. */
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    /*
     * Guarded because this is a convenience, not a correctness requirement, and
     * it must never be the thing that breaks the control. jsdom does not
     * implement it at all, and older engines implement it without options — in
     * both cases the list simply does not auto-scroll, which is a smaller
     * failure than a dropdown that throws when arrowed through.
     */
    if (typeof node?.scrollIntoView === "function") node.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";

  /*
   * Where the popup is portalled to, and why it is not always the body.
   *
   * An open window marks every other overlay root — and the whole shell —
   * `inert`, so that a person cannot tab or click into the page behind the
   * dialog they are answering. A popup sent to the body from inside a dialog
   * therefore lands in inert territory: it renders, it is visible, and it
   * silently refuses every click. That is what a dropdown inside "Add team
   * member" did, and it would have shipped as a control that simply did not
   * work in exactly the places where forms live.
   *
   * So the popup joins the overlay it belongs to when there is one, and the
   * body only when there is not. Either way it escapes the panel's stacking
   * context, which is the reason for portalling in the first place.
   */
  const [host, setHost] = useState<HTMLElement | null>(null);

  return (
    <span className={cn("rect-select", `rect-select--${variant}`, className)}>
      {/*
        * The real control. Kept in the DOM and kept working: it holds the
        * value, it is what `register()` attaches to, and it is what the form
        * submits. `aria-hidden` and `tabIndex={-1}` remove it from the
        * accessibility tree and the tab order, because the trigger beside it
        * presents the same control properly — exposing both would announce
        * every dropdown twice.
        */}
      <select
        {...props}
        /*
         * Both refs, and this is not a nicety.
         *
         * `register()` returns a `ref` and passes it through the spread above.
         * Setting our own `ref` afterwards silently won, so React Hook Form
         * held a reference to nothing: every form using a dropdown submitted
         * that field as `undefined` while looking completely correct on screen.
         * That is the exact failure this whole design exists to avoid, and it
         * was caught by a test that submitted a form rather than by one that
         * only clicked an option.
         */
        ref={(node) => {
          nativeRef.current = node;
          if (typeof forwardedRef === "function") forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        /*
         * The caller's `id` goes to the TRIGGER, not here. `Field` clones an
         * `id` onto its child and points its `<label htmlFor>` at it, so
         * leaving it on the hidden element would aim every field label at a
         * control nobody can see — and the visible trigger would have no
         * accessible name at all. The native element keeps a derived id so it
         * is still uniquely addressable.
         */
        id={id ? `${id}-native` : undefined}
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
        className="rect-select__native"
        onChange={(event) => {
          setShown(event.target.value);
          onChange?.(event);
        }}
      >
        {children}
      </select>

      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={cn("rect-select__trigger", invalid && "rect-select__trigger--invalid")}
        disabled={disabled}
        onClick={() => (open ? close(true) : openList())}
        onKeyDown={onTriggerKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-haspopup="listbox"
        aria-invalid={ariaInvalid ?? invalid}
        {...(ariaDescribedBy ? { "aria-describedby": ariaDescribedBy } : {})}
        {...(ariaRequired ? { "aria-required": ariaRequired } : {})}
        {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
        {...(ariaLabelledBy ? { "aria-labelledby": ariaLabelledBy } : {})}
        {...(open && choices[activeIndex]
          ? { "aria-activedescendant": `${listboxId}-${activeIndex}` }
          : {})}
      >
        <span className="rect-select__value">{selected?.label ?? ""}</span>
        <ChevronDown className="rect-select__chevron" size={16} strokeWidth={2} aria-hidden />
      </button>

      {open && anchor && host
        ? createPortal(
            <div
              ref={listRef}
              id={listboxId}
              role="listbox"
              data-state="open"
              className="rect-select__popup"
              style={{
                position: "fixed",
                top: anchor.above ? undefined : `${anchor.top}px`,
                bottom: anchor.above ? `${window.innerHeight - anchor.top}px` : undefined,
                // Positioned from the leading edge in both directions: `left`
                // is a physical coordinate and the measurement already accounts
                // for where the trigger actually is, so RTL needs no second case.
                left: `${anchor.inlineStart}px`,
                minWidth: `${anchor.width}px`,
                direction: rtl ? "rtl" : "ltr",
              }}
            >
              {choices.map((choice, index) => (
                <div
                  key={choice.value || `blank-${index}`}
                  id={`${listboxId}-${index}`}
                  data-index={index}
                  /*
                   * The underlying value, exposed so a caller can address a row
                   * by what it means rather than by the words currently shown —
                   * labels are translated, values are not.
                   */
                  data-value={choice.value}
                  role="option"
                  aria-selected={choice.value === shown}
                  aria-disabled={choice.disabled || undefined}
                  className={cn(
                    "rect-select__option",
                    index === activeIndex && "rect-select__option--active",
                    choice.value === shown && "rect-select__option--selected",
                  )}
                  /*
                   * pointerdown rather than click: the outside-click listener
                   * above runs on pointerdown too, and a click handler would
                   * fire after the popup had already been dismissed.
                   */
                  onPointerDown={(event) => {
                    event.preventDefault();
                    if (choice.disabled) return;
                    commit(choice.value);
                    close(true);
                  }}
                  onPointerEnter={() => !choice.disabled && setActiveIndex(index)}
                >
                  <span className="rect-select__option-label">{choice.label}</span>
                  {choice.value === shown ? (
                    <Check className="rect-select__tick" size={14} strokeWidth={2.4} aria-hidden />
                  ) : null}
                </div>
              ))}
            </div>,
            host,
          )
        : null}
    </span>
  );
}
