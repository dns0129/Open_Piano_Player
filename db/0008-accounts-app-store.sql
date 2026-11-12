-- App Store receipts are immutable financial evidence. Keep transaction IDs and
-- opaque account tokens after account deletion; remove the account linkage.
ALTER TABLE qinban_control.point_grants ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

-- First use fixes this database to one StoreKit environment. There is no runtime
-- operation that changes it; staging and production need separate databases.
CREATE TABLE IF NOT EXISTS qinban_control.apple_environment (
 id integer PRIMARY KEY CHECK(id=1),
 environment text NOT NULL CHECK(environment IN ('Sandbox','Production'))
);

CREATE TABLE IF NOT EXISTS qinban_control.apple_accounts (
 environment text NOT NULL CHECK(environment IN ('Sandbox','Production')),
 account_token uuid NOT NULL, owner_id uuid, retired_at timestamptz,
 created_at timestamptz NOT NULL, last_synced_at timestamptz,
 PRIMARY KEY(environment,account_token), UNIQUE(environment,owner_id),
 CHECK((owner_id IS NULL) = (retired_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS qinban_control.apple_transactions (
 environment text NOT NULL, transaction_id text NOT NULL,
 original_transaction_id text NOT NULL, account_token uuid NOT NULL,
 owner_id uuid, product_id text NOT NULL, apple_product_id text NOT NULL,
 product_kind text NOT NULL, points integer NOT NULL CHECK(points>0),
 purchase_ms bigint NOT NULL, expires_ms bigint, revoked_ms bigint,
 version_ms bigint NOT NULL, revocation_version_ms bigint NOT NULL DEFAULT 0, grant_id text NOT NULL,
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 PRIMARY KEY(environment,transaction_id),
 FOREIGN KEY(environment,account_token) REFERENCES qinban_control.apple_accounts(environment,account_token)
);
CREATE INDEX IF NOT EXISTS apple_transactions_owner ON qinban_control.apple_transactions(environment,owner_id,purchase_ms DESC);
CREATE INDEX IF NOT EXISTS apple_transactions_original ON qinban_control.apple_transactions(environment,original_transaction_id);

CREATE TABLE IF NOT EXISTS qinban_control.apple_subscriptions (
 environment text NOT NULL, original_transaction_id text NOT NULL,
 owner_id uuid, transaction_id text NOT NULL, product_id text NOT NULL,
 apple_product_id text NOT NULL, purchase_ms bigint NOT NULL,
 expires_ms bigint NOT NULL, revoked_ms bigint, status integer NOT NULL,
 auto_renew boolean, grace_expires_ms bigint, version_ms bigint NOT NULL,
 renewal_version_ms bigint NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL,
 PRIMARY KEY(environment,original_transaction_id)
);
CREATE INDEX IF NOT EXISTS apple_subscriptions_owner ON qinban_control.apple_subscriptions(environment,owner_id,expires_ms DESC);
CREATE TABLE IF NOT EXISTS qinban_control.apple_notifications (
 environment text NOT NULL, notification_uuid uuid NOT NULL,
 payload_hash text NOT NULL, notification_type text NOT NULL,
 signed_ms bigint NOT NULL, transaction_id text, outcome text NOT NULL,
 received_at timestamptz NOT NULL,
 PRIMARY KEY(environment,notification_uuid)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON qinban_control.apple_accounts,
 qinban_control.apple_transactions,qinban_control.apple_subscriptions,
 qinban_control.apple_notifications TO qinban_library;
GRANT SELECT,INSERT ON qinban_control.apple_environment TO qinban_library;
