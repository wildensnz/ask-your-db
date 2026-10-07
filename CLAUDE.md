# Ask Your DB — project context for Claude Code

Portfolio project: a small, polished Text-to-SQL agent demo. Priorities, in order:
**safety → clarity → looks good in screenshots → everything else.** Do not add
features that are not in PLAN.md without asking.

## What it is

Single-page Next.js app. The user asks a business question in plain language;
a Claude agent (tool calling) writes SQL, a guard validates it, it runs
read-only against a demo Postgres (Neon), and the UI shows SQL + table +
optional chart + a short answer. See PLAN.md for phases and file layout.

## Stack

Next.js (App Router) · TypeScript strict · Tailwind v4 · shadcn/ui · `pg` ·
`@anthropic-ai/sdk` · `zod` · Recharts · Vitest. Node 22. npm.

## Conventions (same as my other repos)

- Prettier: single quotes, semicolons, trailing commas, 80 cols, 2 spaces,
  `prettier-plugin-tailwindcss`. ESLint type-checked. `npm run check` must pass
  (typecheck + lint + format:check + test) before every commit.
- Small files, one responsibility each. Pure logic in `lib/` with unit tests.
- UI copy in English. Money shown as `RD$ 1,248,500.00`. No emojis in UI.
- Commit per phase with a clear message. Never commit `.env.local`.

## Hard safety rules (non-negotiable)

- The app only ever connects with the read-only role `askdb_reader`.
  `DATABASE_URL_ADMIN` is used by `db:setup` only and never shipped to Vercel.
- Every query goes through `lib/sql-guard.ts` AND a `READ ONLY` transaction
  with `statement_timeout = 5000` and `LIMIT 200`.
- Agent loop: max 4 iterations, bounded `max_tokens`, rate limit on `/api/ask`.
- Never put user input into SQL yourself; only the model writes SQL and only
  the guard decides if it runs.

## Env vars

`ANTHROPIC_API_KEY`, `DATABASE_URL` (reader role), `DATABASE_URL_ADMIN`
(setup only), `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`).

## Demo data

"Colmado Digital", a fictional Dominican distributor. Tables: categories,
products, customers (with province), sales_reps, orders, order_items.
12 months, deterministic seed, amounts in RD$. No real data anywhere.

## Done means

`npm run check` green · 6 example questions work · "drop table" is refused ·
impossible question is answered honestly · deployed on Vercel · README with
screenshots and a Safety section · CI green.
