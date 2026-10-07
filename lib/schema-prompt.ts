/**
 * Compact description of the demo database for the agent's system prompt.
 * Keep it short: every token here is paid on every question.
 */

export const DATA_RANGE = { start: '2025-10-01', end: '2026-09-30' } as const;

export const SCHEMA_PROMPT = `Database: "Colmado Digital", a fictional Dominican distributor of groceries
and household goods. PostgreSQL. Amounts are Dominican pesos (RD$).
Data covers ${DATA_RANGE.start} to ${DATA_RANGE.end} (12 full months).
Product, customer and category names are in Spanish.

Tables:

categories(id, name)
  8 categories, e.g. 'Bebidas', 'Snacks', 'Lácteos', 'Limpieza'.

products(id, category_id -> categories.id, name, brand, unit_price, unit, stock, active)
  ~80 products. unit_price is the list price in RD$. stock is units on hand
  (a snapshot, not derived from orders). active=false means discontinued.

sales_reps(id, name, region, hired_at)
  8 reps. region is a sales territory, e.g. 'Gran Santo Domingo', 'Cibao Norte'.

customers(id, name, customer_type, province, city, sales_rep_id -> sales_reps.id, since)
  ~300 retail customers. customer_type in ('Colmado','Supermercado','Minimarket',
  'Cafetería','Almacén'). province is a Dominican province, e.g. 'Santiago',
  'Distrito Nacional', 'Santo Domingo'. since = first purchase date.

orders(id, customer_id -> customers.id, sales_rep_id -> sales_reps.id, order_date, status, total)
  ~4,000 orders. status in ('paid','pending','cancelled').
  total = sum of the order's line_total in RD$.

order_items(id, order_id -> orders.id, product_id -> products.id, quantity, unit_price, line_total)
  line_total = quantity * unit_price (price at time of sale).

Business rules:
- "Sales" or "revenue" means orders with status = 'paid' unless the user asks
  otherwise. Always say which statuses you counted.
- orders.sales_rep_id is the rep credited for the order (usually the
  customer's rep, occasionally a colleague covering).
- Month boundaries: use date_trunc('month', order_date).
- The data is synthetic and fixed: "this month" or "last month" are relative
  to ${DATA_RANGE.end}, the latest order date.
`;
