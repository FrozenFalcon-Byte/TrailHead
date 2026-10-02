/* Example prompts the composer boxes type out as placeholders (Tab fills one in). */

export const ASK_EXAMPLES = [
  'Where are failed requests retried?',
  'How does the scheduler decide which request goes next?',
  'Why does the HTTP cache middleware store responses on disk?',
  'What breaks if I change how Request.meta is copied?',
  'How do I run the test suite?',
]

export const FIND_EXAMPLES = [
  'Where is the robots.txt check?',
  'The code that follows redirects',
  'Where user agents are rotated',
  'How the download delay is applied',
  'The place that parses sitemaps',
]

export const TOUR_EXAMPLES = [
  'I want to add a new retry policy that backs off exponentially.',
  'I want to add a setting that caps requests per domain.',
  'I want to understand how a response travels to the spider.',
  'I want to fix a bug in cookie handling across redirects.',
]
