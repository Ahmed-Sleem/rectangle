/**
 * Person representation helpers, kept out of the component file so fast
 * refresh keeps working — a module exporting both components and helpers
 * loses it.
 */

/**
 * Derives initials from a display name.
 *
 * Takes the first character of the first and last parts, using array spread
 * rather than `charAt` so a name beginning with an astral-plane character or
 * a combining mark is not cut in half.
 */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return [...parts[0]!].slice(0, 1).join("");
  return [...parts[0]!].slice(0, 1).join("") + [...parts[parts.length - 1]!].slice(0, 1).join("");
}

/**
 * How many avatar tints exist. The palette is fixed rather than generated
 * from a random hue: arbitrary HSL produces muddy colours and unpredictable
 * contrast, while a hand-picked set can be checked once against the theme and
 * relied on everywhere.
 */
export const AVATAR_TINT_COUNT = 8;

/**
 * Picks a person's tint.
 *
 * Deterministic, so the same person is the same colour on every screen and
 * across reloads — a colour that changed per render would be decoration
 * pretending to be identity. Keyed by user id where one exists, because a
 * person who changes their name should keep their colour.
 */
export function avatarTint(key: string): number {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    // Classic 31-multiplier string hash, kept in 32-bit range.
    hash = (hash * 31 + key.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % AVATAR_TINT_COUNT;
}
