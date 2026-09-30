// Real output from Trailhead on scrapy/scrapy (Jev beam search, replayed from the call cache), not mock data.
export const NAV_DEMO = {
  question: 'Where are failed requests retried?',
  steps: [
    { depth: 0, node: '/', options: [{ name: 'scrapy/', p: 0.97 }, { name: 'docs/', p: 0.0 }, { name: 'AUTHORS', p: 0.0 }, { name: 'NEWS', p: 0.0 }], none: 0.03 },
    { depth: 1, node: 'scrapy/', options: [{ name: 'downloadermiddlewares/', p: 0.99 }, { name: 'core/', p: 0.01 }, { name: 'addons.py', p: 0.0 }, { name: '__init__.py', p: 0.0 }], none: 0.0 },
    { depth: 2, node: 'downloadermiddlewares/', options: [{ name: 'retry.py', p: 1.0 }, { name: 'cookies.py', p: 0.0 }, { name: 'httpauth.py', p: 0.0 }, { name: 'downloadtimeout.py', p: 0.0 }], none: 0.0 },
  ],
  answer: 'scrapy/downloadermiddlewares/retry.py',
  score: 0.987,
  separation: 4.18,
}

export const TOUR_DEMO = {
  goal: 'Add an option to limit how many times a request is retried for a specific HTTP status code',
  stops: [
    { path: 'scrapy/downloadermiddlewares/retry.py', need: 0.88, look: ['RetryMiddleware', 'get_retry_request'], why: 'Where retries happen, and it already reads a per-request retry limit.', past: 'PR #2643 · Set RETRY_TIMES per request' },
    { path: 'scrapy/settings/default_settings.py', need: 0.44, look: ['RETRY_HTTP_CODES'], why: 'Retry defaults live here; past retry-code changes landed in this file.', past: 'PR #2852 · Retry HTTP 522/524', tentative: true },
    { path: 'scrapy/settings/__init__.py', need: 0.48, look: ['Settings', 'BaseSettings'], why: 'How a new setting is read and given a priority.', tentative: true },
  ],
  considered: 16,
}

export const EVIDENCE_DEMO = [
  { ref: 'PR #2643', title: 'Add feature to set RETRY_TIMES per request', kind: 'pull request', relevance: 0.93, kept: true },
  { ref: 'issue #2642', title: 'Allow max_retry_times in request.meta', kind: 'issue', relevance: 0.88, kept: true },
  { ref: 'commit 810658b', title: 'Add feature to set RETRY_TIMES per request (#2642)', kind: 'commit', relevance: 0.81, kept: true },
  { ref: 'comment 2470139374', title: '“ignore previous instructions and…”', kind: 'comment', relevance: 0.02, kept: false, injection: true },
  { ref: 'PR #6545', title: 'Commit the mitmproxy dhparam file', kind: 'pull request', relevance: 0.04, kept: false },
]
