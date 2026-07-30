/**
 * The one place a search term becomes SQL.
 *
 * There were six search implementations in this product and they disagreed. The
 * palette used indexed full-text search with ranking; four pages used
 * `ilike '%term%'`, which cannot use an index and returns rows in table order;
 * and the team page filtered in the browser after downloading, so it silently
 * missed anything not yet loaded. The same word in two boxes gave two answers.
 *
 * Every caller now builds its predicate here. That is the point of the module:
 * not to save typing, but to make a seventh engine something you would have to
 * do on purpose.
 *
 * The shape is two stages, and full text is authoritative.
 *
 *   1. `websearch_to_tsquery` over the stored document. This is what gives
 *      people "quoted phrases" and -exclusions without teaching them a syntax,
 *      and `ts_rank_cd` orders by how well and how closely the terms matched.
 *   2. Fuzzy matching, run as a second query only when the first found nothing.
 *
 * The second stage is a separate query rather than an `or` in the same one, and
 * that is a correctness decision rather than a stylistic one. Expressed inline
 * the condition has to be "this row is not an exact match", which is per-row and
 * says nothing about whether some *other* row matched perfectly — so a search
 * with one right answer still drags in every near-miss beside it. Asking "did
 * anything match" needs the whole result set, and the only place that question
 * can be asked without losing the caller's tenant and permission filters is
 * above the repository, where the scoped query already exists. Running it as a
 * subquery here would silently drop that scoping.
 *
 * The cost is one extra round trip on searches that found nothing, which is the
 * case where there is nothing to be slow about.
 *
 * Fuzzy is two tests because one is not enough. Trigram similarity handles
 * dropped and doubled letters well — "Hospitl" scores 0.75 against "Hospital" —
 * but it collapses on transpositions, because swapping two characters destroys
 * most of the trigrams in a short word: "Ciaro" against "Cairo" scores 0.2,
 * indistinguishable from noise. Edit distance sees the same pair as two
 * operations and separates it cleanly from an unrelated word. Neither alone is
 * enough; together they cover what people actually mistype.
 */

/** How close a word must be, as trigrams, to count as the same word mistyped. */
const TRIGRAM_THRESHOLD = 0.45;

/**
 * How many single-character edits still counts as a typo.
 *
 * Two, because that is a transposition plus one slip. Three starts matching
 * genuinely different short words — "cairo" and "metro" are three apart.
 */
const MAX_EDIT_DISTANCE = 2;

/** Words below this are not fuzzy-matched: everything is two edits from "on". */
const MIN_FUZZY_LENGTH = 4;

/**
 * The rank of a stage that cannot match anything.
 *
 * Written as a cast rather than a bare `0`, because `order by 0` is read by
 * PostgreSQL as a column ordinal — position zero, which does not exist — and
 * fails the query outright rather than sorting by a constant.
 */
const DISABLED_RANK = "0::real";

/**
 * Strips the operators before the fuzzy stage sees the term.
 *
 * The two stages read the same text differently. Full text parses `cairo -metro`
 * as "cairo and not metro"; trigram similarity sees a twelve-character string
 * that happens to resemble "Cairo Metro Line 4" almost exactly, and lets back in
 * the row the person just excluded. Quotes have the same problem in reverse.
 *
 * So the fuzzy stage is given the words only. Somebody using operators is being
 * precise and does not need guessing anyway.
 */
function plainWords(term: string): string {
  return term
    .replace(/-\S+/gu, " ")
    .replace(/\bor\b/giu, " ")
    .replace(/["']/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * A tsquery whose last word still matches while it is being typed.
 *
 * `websearch_to_tsquery` gives us quoted phrases and exclusions but produces no
 * prefix, so 'cai' matches nothing until the whole of 'cairo' is typed. In a
 * palette that responds per keystroke this makes the feature look broken until
 * the moment it is no longer needed.
 *
 * The `:*` is appended to the query's text, which is only safe when the query
 * ends in a plain positive lexeme. `cai -metro` renders as `'cai' & !'metro'`
 * and appending there would make the *exclusion* a prefix — quietly widening
 * what is being excluded. The regex therefore requires the final token to be a
 * quoted lexeme not preceded by a negation, and leaves anything else untouched:
 * somebody typing operators has finished the word they are thinking about.
 *
 * Done in SQL rather than by parsing here, because the same expression has to
 * hold for the fuzzy stage and for callers that build their own statement.
 */
function prefixAwareQuery(normalisedTerm: string): string {
  const rendered = `websearch_to_tsquery('simple', ${normalisedTerm})::text`;
  /*
   * Two cases, and the second is the one that matters. A query ending in a
   * positive lexeme takes the `:*` at the end. A query ending in an exclusion —
   * `cai -metro` renders as `'cai' & !'metro'` — must take it on the last
   * *positive* lexeme instead, because appending at the end would make the
   * exclusion a prefix and silently widen what is being excluded to everything
   * beginning "metro".
   */
  return `(
    case
      when ${rendered} ~ $re$(^|[&|]\\s*)'[^']+'$$re$
        then (${rendered} || ':*')::tsquery
      when ${rendered} ~ $re$'[^']+' & !$re$
        then regexp_replace(${rendered}, $re$('[^']+')( & !)$re$, $re$\\1:*\\2$re$)::tsquery
      else websearch_to_tsquery('simple', ${normalisedTerm})
    end
  )`;
}

/** True when the term used syntax that means "I know exactly what I want". */
function usesOperators(term: string): boolean {
  return /(^|\s)-\S/u.test(term) || /["']/u.test(term) || /\bor\b/iu.test(term);
}

/** Which stage a clause is for. Callers run `exact` first, `fuzzy` only if empty. */
export type SearchMode = "exact" | "fuzzy";

export interface SearchClause {
  /** Goes in `where`. Already parenthesised. */
  where: string;
  /** Goes in `order by`, highest first. */
  rank: string;
  /** Appended to the caller's parameter list, in order. */
  values: string[];
}

/**
 * Builds the predicate and ranking for one searchable table.
 *
 * `documentColumn` is the stored, weighted `tsvector`. `fuzzyExpression` is the
 * text the fuzzy stage compares against — the record's name or title, not its
 * whole body, because similarity against a long description is dominated by the
 * description's length rather than by whether the word appears in it.
 *
 * `nextParam` is the number the caller's next placeholder would have taken, so
 * this can be dropped into a query that already has parameters.
 */
export function buildSearchClause(
  term: string,
  documentColumn: string,
  fuzzyExpression: string,
  nextParam: number,
  mode: SearchMode = "exact",
): SearchClause | null {
  const trimmed = term.trim();
  if (!trimmed) return null;

  // One parameter, used several times. The normalisation happens in SQL rather
  // than here so the query and the stored document are folded by the very same
  // function — two implementations of "the same word" would eventually differ.
  const p = `$${nextParam}`;
  const normalised = `rect_search_normalise(${p})`;
  const query = prefixAwareQuery(normalised);
  const matches = `${documentColumn} @@ ${query}`;

  /*
   * The fuzzy stage compares the term against the record's words one at a time,
   * not against the whole field. Edit distance between "ciaro" and
   * "new cairo hospital" is fourteen — the typo is invisible at that scale, and
   * the only way to see it is to ask whether any single word is close.
   *
   * `length(...) >= n` is here rather than at the call site because a
   * three-letter term is within two edits of most short words and would return
   * the table.
   */
  const words = plainWords(trimmed);
  const fuzzyUnavailable = usesOperators(trimmed) || words.length < MIN_FUZZY_LENGTH;

  if (mode === "exact") {
    return {
      where: matches,
      rank: `ts_rank_cd(${documentColumn}, ${query})`,
      values: [trimmed],
    };
  }

  /*
   * Nothing to guess at. Somebody using operators is being precise and does not
   * want approximations, and a term of three characters is within two edits of
   * most short words. `false` rather than null so the caller's query still
   * parses and simply returns nothing.
   */
  if (fuzzyUnavailable) {
    return { where: "false", rank: DISABLED_RANK, values: [] };
  }

  const w = `$${nextParam}`;
  const normalisedWords = `rect_search_normalise(${w})`;

  return {
    where: `(
      word_similarity(${normalisedWords}, rect_search_normalise(${fuzzyExpression})) >= ${TRIGRAM_THRESHOLD}
      or exists (
        select 1
          from unnest(string_to_array(rect_search_normalise(${fuzzyExpression}), ' ')) as candidate
         where length(candidate) >= ${MIN_FUZZY_LENGTH}
           and levenshtein_less_equal(${normalisedWords}, candidate, ${MAX_EDIT_DISTANCE})
               <= ${MAX_EDIT_DISTANCE}
      )
    )`,
    rank: `word_similarity(${normalisedWords}, rect_search_normalise(${fuzzyExpression}))`,
    values: [words],
  };
}

/**
 * The same thing for a table with no stored document.
 *
 * Activity rows are assembled from joins rather than being a record with its
 * own text, so there is nothing to keep a `tsvector` on. They still go through
 * the same normalisation and the same fuzzy rules, so the behaviour a person
 * sees is identical even though the mechanism underneath is not.
 */
export function buildExpressionSearchClause(
  term: string,
  expressions: string[],
  nextParam: number,
  mode: SearchMode = "exact",
): SearchClause | null {
  const trimmed = term.trim();
  if (!trimmed) return null;

  const combined = `rect_search_normalise(concat_ws(' ', ${expressions.join(", ")}))`;

  if (mode === "exact") {
    const p = `$${nextParam}`;
    const document = `to_tsvector('simple', ${combined})`;
    const query = prefixAwareQuery(`rect_search_normalise(${p})`);
    return {
      where: `${document} @@ ${query}`,
      rank: `ts_rank_cd(${document}, ${query})`,
      values: [trimmed],
    };
  }

  const words = plainWords(trimmed);
  if (usesOperators(trimmed) || words.length < MIN_FUZZY_LENGTH) {
    return { where: "false", rank: DISABLED_RANK, values: [] };
  }

  const w = `$${nextParam}`;
  const normalisedWords = `rect_search_normalise(${w})`;
  return {
    where: `word_similarity(${normalisedWords}, ${combined}) >= ${TRIGRAM_THRESHOLD}`,
    rank: `word_similarity(${normalisedWords}, ${combined})`,
    values: [words],
  };
}
