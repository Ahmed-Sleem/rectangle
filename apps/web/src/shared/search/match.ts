/**
 * The matching rules, for the one list the browser already holds.
 *
 * Every other search in the product runs in SQL, because those lists are paged
 * or permission-filtered: to search them here we would first have to send the
 * whole set to the browser, including records the reader may not open. People
 * are the exception. The Team page already downloads every person and every
 * role with no limit, so filtering them here searches everything there is, and
 * a round trip per keystroke would only add latency to a list already in memory.
 *
 * What must not differ is the *behaviour*. Somebody who has learned that
 * searching 'احمد' finds أحمد, or that a missing letter still finds the record,
 * should not discover that one page in the product disagrees. So the rules here
 * are deliberately the same rules as `search-sql.ts`: identical normalisation,
 * identical typo thresholds, identical "precise first, forgiving only if that
 * found nothing" ordering.
 *
 * The two implementations are checked against each other by
 * `search-parity.test.ts`, which runs the same terms through this module and
 * through the database and requires the same answers. Written prose promising
 * they agree would be worth nothing; the test is the thing that keeps it true.
 */

/** Mirrors `MIN_FUZZY_LENGTH` in the SQL engine. */
const MIN_FUZZY_LENGTH = 4;

/** Mirrors `MAX_EDIT_DISTANCE` in the SQL engine. */
const MAX_EDIT_DISTANCE = 2;

/** Mirrors `TRIGRAM_THRESHOLD` in the SQL engine. */
const TRIGRAM_THRESHOLD = 0.45;

/**
 * Folds text the way `rect_search_normalise` does in the database.
 *
 * Arabic is why this exists. The alef forms أ إ آ ٱ are one letter to a reader
 * and people type whichever their keyboard offers, so they have to be one word
 * here; ة and ه likewise at the end of a word. Tashkeel and tatweel are
 * decoration and carry no search meaning.
 *
 * `unaccent` is not the answer to this and was checked before being ruled out:
 * it turns 'Héllo' into 'Hello' and leaves 'أَحْمَد' exactly as it found it.
 */
export function normaliseForSearch(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[أإآٱ]/gu, "ا")
    // Alef maqsura is a final-position spelling of ya, not of alef: 'مصطفى'
    // and 'مصطفي' are one name. Folding it to alef made them two.
    .replace(/ى/gu, "ي")
    .replace(/ة/gu, "ه")
    .replace(/[\u064B-\u0652\u0640]/gu, "");
}

/**
 * Splits a normalised string into the words a match can be found in.
 *
 * On punctuation as well as spaces, because PostgreSQL's tokeniser does and the
 * two sides have to agree. Splitting on spaces alone made
 * 'ahmed.ar@example.com' a single token, so searching 'ahmd' found the Latin
 * Ahmed and not the Arabic one whose address contains the same letters — the
 * database found both. The parity test caught it; nothing else would have.
 */
function words(value: string): string[] {
  return value.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * Edit distance, stopped early once it cannot come in under the limit.
 *
 * Bounded rather than complete because the answer is only ever compared with a
 * threshold, and a full matrix over every word of every row is work nobody
 * reads. Two rows of state instead of the whole grid, for the same reason.
 */
function withinEditDistance(a: string, b: string, limit: number): boolean {
  if (Math.abs(a.length - b.length) > limit) return false;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let best = i;

    for (let j = 1; j <= b.length; j += 1) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      const insertion = (current[j - 1] ?? 0) + 1;
      const deletion = (previous[j] ?? 0) + 1;
      const cost = Math.min(substitution, insertion, deletion);
      current.push(cost);
      best = Math.min(best, cost);
    }

    // Nothing later in the matrix can reduce the best value on this row.
    if (best > limit) return false;
    previous = current;
  }

  return (previous[b.length] ?? Number.POSITIVE_INFINITY) <= limit;
}

/** Trigram similarity, the same measure `word_similarity` uses in Postgres. */
function trigrams(value: string): Set<string> {
  const padded = `  ${value} `;
  const result = new Set<string>();
  for (let index = 0; index < padded.length - 2; index += 1) {
    result.add(padded.slice(index, index + 3));
  }
  return result;
}

function similarity(a: string, b: string): number {
  const left = trigrams(a);
  const right = trigrams(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** How closely the term resembles the nearest single word in the text. */
function bestWordSimilarity(term: string, text: string): number {
  return words(text).reduce((best, word) => Math.max(best, similarity(term, word)), 0);
}

/** A parsed search term: the words to match, and whether operators were used. */
interface ParsedTerm {
  /** Words that must be present. */
  required: string[];
  /** Words that must be absent. */
  excluded: string[];
  /** A quoted run that must appear in order. */
  phrases: string[][];
  /** Alternatives, any one of which satisfies the search. */
  alternatives: string[];
  /** True when the person used syntax, so guessing is switched off. */
  precise: boolean;
}

/**
 * Reads the same syntax `websearch_to_tsquery` accepts.
 *
 * Quoted phrases, `-` to exclude, `or` between alternatives. Nobody has to
 * learn it — it is what people already do in a web search box — but the ones
 * who use it get the same result here as they do everywhere else.
 */
export function parseSearchTerm(raw: string): ParsedTerm {
  const term = raw.trim();
  const phrases: string[][] = [];

  const withoutPhrases = term.replace(/"([^"]+)"/gu, (_, phrase: string) => {
    phrases.push(words(normaliseForSearch(phrase)));
    return " ";
  });

  const required: string[] = [];
  const excluded: string[] = [];
  const alternatives: string[] = [];
  const tokens = withoutPhrases.split(/\s+/u).filter(Boolean);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    if (token.toLowerCase() === "or") {
      // The word before and the word after are alternatives, not requirements.
      const previous = required.pop();
      if (previous !== undefined) alternatives.push(previous);
      const next = tokens[index + 1];
      if (next) {
        alternatives.push(normaliseForSearch(next));
        index += 1;
      }
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      excluded.push(normaliseForSearch(token.slice(1)));
      continue;
    }
    /*
     * A hyphenated token is several words, and they must all be present.
     * PostgreSQL reads 'read-only' as the compound followed by its parts, so
     * it matches text containing "read only"; splitting here keeps the browser
     * agreeing with that. Leading '-' is handled above as an exclusion, so
     * only interior hyphens reach this point.
     */
    for (const part of normaliseForSearch(token).split(/[^\p{L}\p{N}]+/u)) {
      if (part) required.push(part);
    }
  }

  return {
    required,
    excluded,
    phrases,
    alternatives,
    precise: excluded.length > 0 || phrases.length > 0 || alternatives.length > 0,
  };
}

/** Does this text satisfy the precise reading of the term? */
function matchesExactly(parsed: ParsedTerm, normalisedText: string): boolean {
  const textWords = words(normalisedText);

  /*
   * A required word matches as a prefix, because a palette answers per
   * keystroke and the last word is usually half-typed. The SQL side does the
   * same by appending `:*` to the final lexeme.
   */
  const present = (needle: string) => textWords.some((word) => word.startsWith(needle));

  if (!parsed.required.every(present)) return false;
  if (parsed.excluded.some(present)) return false;

  for (const phrase of parsed.phrases) {
    const joined = phrase.join(" ");
    if (!normalisedText.includes(joined)) return false;
  }

  if (parsed.alternatives.length > 0 && !parsed.alternatives.some(present)) return false;

  return true;
}

/** Does this text plausibly contain the term mistyped? */
function matchesApproximately(parsed: ParsedTerm, normalisedText: string): boolean {
  if (parsed.precise) return false;

  const term = parsed.required.join(" ");
  if (term.length < MIN_FUZZY_LENGTH) return false;

  if (bestWordSimilarity(term, normalisedText) >= TRIGRAM_THRESHOLD) return true;

  return words(normalisedText).some(
    (word) => word.length >= MIN_FUZZY_LENGTH && withinEditDistance(term, word, MAX_EDIT_DISTANCE),
  );
}

/**
 * Filters and orders records the same way the database would.
 *
 * `text` returns everything about a record that is searchable, in the order it
 * should be weighted — the first entry counts for most, the way `setweight`
 * marks a name above a description.
 */
export function searchRecords<T>(
  records: readonly T[],
  term: string,
  text: (record: T) => string[],
): T[] {
  if (!term.trim()) return [...records];

  const parsed = parseSearchTerm(term);
  const normalised = records.map((record) => ({
    record,
    fields: text(record).map(normaliseForSearch),
  }));

  const score = (fields: string[]) =>
    fields.reduce(
      (best, field, index) =>
        Math.max(best, bestWordSimilarity(parsed.required.join(" "), field) / (index + 1)),
      0,
    );

  const exact = normalised.filter((entry) => matchesExactly(parsed, entry.fields.join(" ")));
  if (exact.length > 0) {
    return exact
      .sort((left, right) => score(right.fields) - score(left.fields))
      .map((entry) => entry.record);
  }

  /*
   * Only when nothing matched, which is the rule the SQL side follows for the
   * same reason: a forgiving pass running alongside a precise one re-admits the
   * records an exclusion just removed.
   */
  return normalised
    .filter((entry) => matchesApproximately(parsed, entry.fields.join(" ")))
    .sort((left, right) => score(right.fields) - score(left.fields))
    .map((entry) => entry.record);
}
