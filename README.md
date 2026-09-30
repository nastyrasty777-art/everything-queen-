# Queendom HQ — everythingqueen.com

Queen E's personal hub: LA Event Planner, Tea Lab, and the 26-week journey tracker,
behind a password. Plain HTML + three Vercel serverless functions. No build step, no npm installs.

## What's in here
- `index.html` — the whole app (Home, Event Planner, Tea Lab, 26-Week Journey), dropdown menu, login screen
- `api/session.js` — sign in / sign out (password from `APP_PASSWORD`, 120-day cookie)
- `api/data.js` — private data API (all collections) stored in Upstash Redis
- `api/refresh.js` — runs the headline pull (`?what=tea`) or event search (`?what=events`)
- `lib/store.js` — Redis over REST, cookies, helpers
- `lib/feeds.js` — Claude API + web search for headlines and LA events
- `vercel.json` — cron schedules (UTC): headlines daily 12:13, events Mondays 12:47
- `seed/starting-data.json` — Tea Lab saves, last week of headlines, IG pages and today's prompt cycle, copied from the Claude version (not deployed)

## Deploy steps
1. Create a **private** GitHub repo (e.g. `everythingqueen`) and upload everything in this folder.
2. Vercel → Add New → Project → import the repo. Framework preset: **Other**. No build command. Deploy.
3. Vercel project → **Storage** → Create/Connect → **Upstash for Redis** (free). This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
4. Vercel project → Settings → **Environment Variables** (Production):
   - `APP_PASSWORD` — your hub password
   - `CRON_SECRET` — any long random text
   - `ANTHROPIC_API_KEY` — optional; turns on automatic headlines + event search (billed to your Claude API account)
   - `ANTHROPIC_MODEL` — optional, defaults to `claude-sonnet-5-5`
5. Redeploy (Deployments → ⋯ → Redeploy) so the variables take effect.
6. Settings → **Domains** → add `everythingqueen.com` and `www.everythingqueen.com`, then add the DNS records Vercel shows at your domain registrar.

## Load the starting data (once, after deploy)
Sign in at everythingqueen.com, open the browser console on that page, and run:
```js
const seed = /* paste the contents of seed/starting-data.json here */;
for (const [c, docs] of Object.entries(seed)) {
  await fetch('/api/data', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({c, docs})});
}
location.reload();
```

## Collections
`meta` (landing text, prompt cycle, last run info), `eventsFound`, `plan`, `igPages`, `trending`, `topics`, `log` (weigh-ins), `habits`.
