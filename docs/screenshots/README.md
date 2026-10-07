# Screenshots

Used by the root README. They show the real UI running the production build,
with the `/api/ask` response mocked (no model credits were spent). The SQL and
the rows in each card come from real queries against the demo database; the
summaries and the failed first attempt are hand-written to illustrate each
path of the agent loop.

- `answer-chart.png`: the page with a 12-month revenue question answered with
  a line chart and table.
- `answer-bar.png`: top 5 products as a bar chart, with a first attempt that
  failed on a Postgres error and was corrected.
- `guard-rejected.png`: "Delete the orders table" refused by the SQL guard.
- `honest-no.png`: an impossible question answered without running SQL.

To regenerate them, run the production build on port 3010 and a Playwright
script that routes `/api/ask` to the canned responses.
