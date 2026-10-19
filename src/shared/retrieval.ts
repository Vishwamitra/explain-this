// Plain BM25 over the passages of one page. A page is small enough that
// ranking in memory is instant, and it needs no embedding model, so asking a
// page costs no extra download.

const STOPWORDS = new Set(
  "a an and are as at be but by for from has have how i if in into is it its of on or that the this to was what when where which who why will with you your".split(
    " "
  )
);

// Crude suffix stripping so "downloads" matches "download". Not a real
// stemmer, just enough for plural and verb endings in English prose.
function stem(token: string): string {
  return token.length > 4 ? token.replace(/(ing|ed|es|s)$/, "") : token;
}

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

const K1 = 1.4;
const B = 0.75;

// Returns the indexes of the best `limit` passages, best first. Passages that
// share no word with the question are dropped, so an off-topic question
// returns nothing rather than a confident guess.
export function rankPassages(question: string, passages: string[], limit: number): number[] {
  const queryTerms = [...new Set(tokenize(question))];
  if (queryTerms.length === 0 || passages.length === 0) return [];

  const docs = passages.map(tokenize);
  const avgLength = docs.reduce((sum, d) => sum + d.length, 0) / docs.length || 1;

  const docFreq = new Map<string, number>();
  for (const term of queryTerms) {
    docFreq.set(term, docs.filter((d) => d.includes(term)).length);
  }

  const scored = docs.map((doc, index) => {
    const counts = new Map<string, number>();
    for (const t of doc) counts.set(t, (counts.get(t) ?? 0) + 1);

    let score = 0;
    for (const term of queryTerms) {
      const tf = counts.get(term);
      if (!tf) continue;
      const df = docFreq.get(term) ?? 0;
      const idf = Math.log(1 + (docs.length - df + 0.5) / (df + 0.5));
      score += (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * doc.length) / avgLength));
    }
    return { index, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.index);
}
