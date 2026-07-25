/**
 * Type machinery that makes a missing translation a compile error.
 *
 * i18next falls back to English at runtime when a key is absent, which means an
 * untranslated screen looks fine in development and ships half-English. Typing
 * every non-English bundle against the English one removes that failure mode:
 * add a key to `en` without translating it and the build stops.
 */

/**
 * The same shape as `Source`, with every leaf still a string. Structure and key
 * names must match exactly; only the values differ.
 */
export type LocaleBundle<Source> = {
  [Key in keyof Source]: Source[Key] extends string
    ? string
    : Source[Key] extends Record<string, unknown>
      ? LocaleBundle<Source[Key]>
      : never;
};

/** A namespace that carries both languages side by side. */
export interface Namespace<Source> {
  en: Source;
  ar: LocaleBundle<Source>;
}
