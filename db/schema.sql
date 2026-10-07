-- Ask Your DB: demo schema for "Colmado Digital", a fictional Dominican
-- distributor. Applied by `npm run db:setup` with the admin connection.
-- Everything here is dropped and recreated; the data is synthetic.

DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS sales_reps CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS categories CASCADE;

CREATE TABLE categories (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE
);

CREATE TABLE products (
  id           SERIAL PRIMARY KEY,
  category_id  INTEGER NOT NULL REFERENCES categories (id),
  name         TEXT NOT NULL,
  brand        TEXT NOT NULL,
  unit_price   NUMERIC(12, 2) NOT NULL CHECK (unit_price > 0),
  unit         TEXT NOT NULL,
  stock        INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE sales_reps (
  id        SERIAL PRIMARY KEY,
  name      TEXT NOT NULL,
  region    TEXT NOT NULL,
  hired_at  DATE NOT NULL
);

CREATE TABLE customers (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  customer_type  TEXT NOT NULL,
  province       TEXT NOT NULL,
  city           TEXT NOT NULL,
  sales_rep_id   INTEGER NOT NULL REFERENCES sales_reps (id),
  since          DATE NOT NULL
);

CREATE TABLE orders (
  id            SERIAL PRIMARY KEY,
  customer_id   INTEGER NOT NULL REFERENCES customers (id),
  sales_rep_id  INTEGER NOT NULL REFERENCES sales_reps (id),
  order_date    DATE NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('paid', 'pending', 'cancelled')),
  total         NUMERIC(12, 2) NOT NULL CHECK (total >= 0)
);

CREATE TABLE order_items (
  id          SERIAL PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products (id),
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  unit_price  NUMERIC(12, 2) NOT NULL CHECK (unit_price > 0),
  line_total  NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0)
);

CREATE INDEX idx_products_category ON products (category_id);
CREATE INDEX idx_customers_province ON customers (province);
CREATE INDEX idx_customers_rep ON customers (sales_rep_id);
CREATE INDEX idx_orders_customer ON orders (customer_id);
CREATE INDEX idx_orders_rep ON orders (sales_rep_id);
CREATE INDEX idx_orders_date ON orders (order_date);
CREATE INDEX idx_orders_status ON orders (status);
CREATE INDEX idx_order_items_order ON order_items (order_id);
CREATE INDEX idx_order_items_product ON order_items (product_id);
