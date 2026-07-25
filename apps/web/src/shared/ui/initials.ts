/**
 * Initials for a person, kept out of the component file so fast refresh keeps
 * working — a module exporting both components and helpers loses it.
 */

/**
 * Derives initials from a display name.
 *
 * Splits on whitespace and takes the first character of the first and last
 * parts, using array spread rather than `charAt` so a name beginning with an
 * astral-plane character or a combining mark is not cut in half.
 */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return [...parts[0]!].slice(0, 1).join("");
  return [...parts[0]!].slice(0, 1).join("") + [...parts[parts.length - 1]!].slice(0, 1).join("");
}
