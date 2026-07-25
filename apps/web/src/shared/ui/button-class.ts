/**
 * The button's visual contract, separated from the component.
 *
 * Some actions are navigation and must render as an anchor so they can be
 * opened in a new tab and announced as links. Those cases need the class names
 * without the `<button>` element, and copying them by hand is how a link and a
 * button drift apart. This lives in its own module so the component file keeps
 * exporting only components.
 */
import { cn } from "@/shared/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export function buttonClassName(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn("rect-ui-button", `rect-ui-button--${variant}`, `rect-ui-button--${size}`, className);
}
