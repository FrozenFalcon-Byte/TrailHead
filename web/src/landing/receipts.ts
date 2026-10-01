// Numbers from eval/results/*.json on scrapy/scrapy. Regenerate with `bin/trailhead eval nav --report-only` / `eval tour --report-only`.
// Jev runs on BeatAPI's free tier (one request a minute), so the Jev rows cover fewer questions so far; n is always shown.
export const NAV_RESULTS = [
  { method: 'Jev beam search', mrr: 0.844, n: 16, ours: true },
  { method: 'Jev greedy', mrr: 0.812, n: 16, ours: true },
  { method: 'BM25 over code', mrr: 0.737, n: 45 },
  { method: 'Embeddings (nomic)', mrr: 0.67, n: 45 },
]
// Tour row: the 10 issues the Jev tour has run on so far, with every method scored on those same 10.
export const TOUR_RESULTS = { jevRecall7: 0.583, jevMrr: 0.65, bm25Recall7: 0.45, bm25Mrr: 0.308, historyRecall7: 0.45, historyMrr: 0.433, n: 10, poolIssues: 60 }
export const COSTS = { requestsPerSearch: 3.6, tokensPerSearch: '4.3k', retrievalTokens: '6k', retrievalPassages: 60 }
