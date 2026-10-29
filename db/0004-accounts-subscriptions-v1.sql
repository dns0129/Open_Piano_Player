-- Additive migration. Uses the existing control connection, separate from private scores.
CREATE TABLE IF NOT EXISTS qinban_control.point_accounts (
 owner_id uuid PRIMARY KEY, created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS qinban_control.point_grants (
 id text PRIMARY KEY, owner_id uuid NOT NULL REFERENCES qinban_control.point_accounts(owner_id),
 kind text NOT NULL, product_id text, amount integer NOT NULL CHECK(amount>0),
 spent integer NOT NULL DEFAULT 0 CHECK(spent>=0), held integer NOT NULL DEFAULT 0 CHECK(held>=0),
 starts_at timestamptz NOT NULL, expires_at timestamptz, billing_day integer,
 created_at timestamptz NOT NULL, CHECK(spent+held<=amount)
);
CREATE INDEX IF NOT EXISTS point_grants_owner ON qinban_control.point_grants(owner_id,expires_at);
CREATE TABLE IF NOT EXISTS qinban_control.point_jobs (
 job_id uuid PRIMARY KEY, owner_id uuid NOT NULL,
 region_ids jsonb NOT NULL, points_per_region integer NOT NULL CHECK(points_per_region>0),
 reserved integer NOT NULL CHECK(reserved>=0), charged integer NOT NULL DEFAULT 0 CHECK(charged>=0),
 refunded integer NOT NULL DEFAULT 0 CHECK(refunded>=0), state text NOT NULL DEFAULT 'held',
 created_at timestamptz NOT NULL, settled_at timestamptz
);
CREATE TABLE IF NOT EXISTS qinban_control.point_allocations (
 job_id uuid NOT NULL REFERENCES qinban_control.point_jobs(job_id),
 grant_id text NOT NULL REFERENCES qinban_control.point_grants(id), amount integer NOT NULL CHECK(amount>0),
 charged integer NOT NULL DEFAULT 0, PRIMARY KEY(job_id,grant_id)
);
CREATE TABLE IF NOT EXISTS qinban_control.point_events (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, kind text NOT NULL,
 amount integer NOT NULL, reference text NOT NULL, created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS point_events_owner ON qinban_control.point_events(owner_id,created_at);
CREATE TABLE IF NOT EXISTS qinban_control.payment_orders (
 id uuid PRIMARY KEY, order_no text NOT NULL UNIQUE, owner_id uuid NOT NULL,
 idempotency_key text NOT NULL, product jsonb NOT NULL, provider text NOT NULL,
 price_fen integer NOT NULL CHECK(price_fen>0), state text NOT NULL DEFAULT 'pending',
 checkout_url text, transaction_id text, created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 paid_at timestamptz, checked_at timestamptz, UNIQUE(owner_id,idempotency_key), UNIQUE(provider,transaction_id)
);
CREATE INDEX IF NOT EXISTS payment_orders_owner ON qinban_control.payment_orders(owner_id,created_at);
GRANT SELECT,INSERT,UPDATE,DELETE ON qinban_control.point_accounts,qinban_control.point_grants,
 qinban_control.point_jobs,qinban_control.point_allocations,qinban_control.point_events,
 qinban_control.payment_orders TO qinban_library;
