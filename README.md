# Ask Ali

A small assistant for my [portfolio](https://alirazaportfolio2026.netlify.app) that answers visitors' questions
using only the site's own pages and my CV, and links to the page each answer comes from. When the site doesn't
cover something, it says so instead of guessing.

## How it works

1. `scripts/build-knowledge.mjs` reads the portfolio's HTML pages and the CV text, strips navigation and scripts,
   and splits the content into about 100 sections, each with a link to its page and heading.
2. `api/ask.js` is a Vercel serverless function. For each question it ranks those sections with BM25 keyword
   search and sends the top few to a free model on [OpenRouter](https://openrouter.ai), numbered as sources.
3. The system prompt in `lib/answer.js` limits the model to those sources, asks for a citation like `[2]` after each
   fact, and tells it to decline questions the sources don't answer.
4. The response returns the answer plus only the sources it cited, so the website can link them.

No database and no npm dependencies. Retrieval runs in memory at cold start.

## Limits

- Keyword search, not embeddings: questions phrased very differently from the site's wording can miss. A small
  synonym list in `lib/answer.js` covers common cases like "grad school" for education.
- Free OpenRouter models can be slow or rate limited. The function tries three models in order and returns a
  friendly "busy" message when all fail.
- Rate limits (8 questions per visitor per 5 minutes, 300 a day) are kept in memory, so they reset when the
  serverless instance restarts. They deter casual abuse, not a determined attacker.
- Answers can still be wrong. The widget says so and always shows its sources.

## Run it

```bash
# 1. Rebuild the knowledge file from a local copy of the portfolio
node scripts/build-knowledge.mjs "/path/to/portfolio website"

# 2. Check retrieval (no API key needed)
node scripts/eval-retrieval.mjs

# 3. Deploy
vercel --prod
```

Set these in the Vercel project's environment variables, never in code:

| Variable | Required | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key |
| `ALLOWED_ORIGINS` | No | Comma-separated sites allowed to call the API |
| `OPENROUTER_MODELS` | No | Comma-separated model list, tried in order |
| `DAILY_LIMIT` | No | Questions allowed per day per instance (default 300) |

Then test real answers, including refusals:

```bash
node scripts/eval-answers.mjs https://YOUR-DEPLOYMENT.vercel.app/api/ask
```

## License

MIT
