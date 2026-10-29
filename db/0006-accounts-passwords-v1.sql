-- Incremental, repeatable migration. Run with maintenance credentials in production.
CREATE TABLE IF NOT EXISTS qinban_identity.passwords (
 user_id uuid PRIMARY KEY REFERENCES qinban_identity.users(id) ON DELETE CASCADE,
 password_hash text NOT NULL,
 updated_at timestamptz NOT NULL
);
REVOKE ALL ON qinban_identity.passwords FROM PUBLIC, qinban_library;
GRANT SELECT, INSERT, UPDATE, DELETE ON qinban_identity.passwords TO qinban_identity;
