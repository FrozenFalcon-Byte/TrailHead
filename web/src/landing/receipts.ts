// Numbers from eval/results/*.json on scrapy/scrapy. Regenerate with `bin/trailhead eval nav --report-only` / `eval tour --report-only`.
// Jev runs on BeatAPI's free tier (one request a minute), so the Jev rows cover fewer questions so far; n is always shown.
export const NAV_RESULTS = [
  { method: 'Jev beam search', mrr: 0.844, n: 16, ours: true },
  { method: 'Jev greedy', mrr: 0.812, n: 16, ours: true },
  { method: 'BM25 over code', mrr: 0.737, n: 45 },
  { method: 'Embeddings (nomic)', mrr: 0.67, n: 45 },
]
export const TOUR_BASELINES = { bm25Recall7: 0.546, historyRecall7: 0.478, issues: 60 }
export const COSTS = { requestsPerSearch: 3.6, tokensPerSearch: '4.3k', retrievalTokens: '6k', retrievalPassages: 60 }
