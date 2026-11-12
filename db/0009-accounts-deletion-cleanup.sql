-- Minimal, non-email tombstones prevent delayed payments/jobs recreating a deleted wallet.
-- These random owner identifiers cannot be used to sign in or recover deleted personal data.
CREATE TABLE IF NOT EXISTS qinban_control.deleted_accounts (
  owner_id uuid PRIMARY KEY,
  deleted_at timestamptz NOT NULL
);
REVOKE ALL ON qinban_control.deleted_accounts FROM PUBLIC;
GRANT SELECT,INSERT ON qinban_control.deleted_accounts TO qinban_library;
