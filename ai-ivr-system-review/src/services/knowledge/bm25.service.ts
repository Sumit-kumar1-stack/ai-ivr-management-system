import { tokenize } from "./tokenizer.service";

const k1 = 1.5;
const b = 0.75;

export function bm25Score(
  query: string,
  document: string
) {
  const queryTerms = tokenize(query);

  const docTerms = tokenize(document);

  if (
    queryTerms.length === 0 ||
    docTerms.length === 0
  ) {
    return 0;
  }

  // Document Length
  const dl = docTerms.length;

  // Average document length
  const avgdl = 100;

  // Frequency map
  const frequencies = new Map<string, number>();

  for (const term of docTerms) {
    frequencies.set(
      term,
      (frequencies.get(term) ?? 0) + 1
    );
  }

  let score = 0;

  for (const term of queryTerms) {
    const tf =
      frequencies.get(term) ?? 0;

    if (tf === 0) {
      continue;
    }

    const numerator =
      tf * (k1 + 1);

    const denominator =
      tf +
      k1 *
        (
          1 -
          b +
          b * (dl / avgdl)
        );

    score +=
      numerator / denominator;
  }

  // Bonus if exact query appears
  if (
    document
      .toLowerCase()
      .includes(query.toLowerCase())
  ) {
    score += 3;
  }

  // Bonus if all query words appear
  const matchedWords =
    queryTerms.filter((term) =>
      frequencies.has(term)
    ).length;

  if (
    matchedWords ===
    queryTerms.length
  ) {
    score += 2;
  }

  return score;
}