-- Additive: open registration, invite codes and one-time recognition task credits.
-- Apply after accounts-v1.sql and accounts-commerce-v1.sql with maintenance credentials.
-- Invite codes live with identity data; task credits live with the quota ledger.
-- In production these can be two databases, so they are linked by redemption id, not a foreign key.

-- Invite codes. Only a keyed hash of the normalized code is stored; code_hint keeps
-- the last characters so owners can tell their codes apart without the full secret.
CREATE TABLE IF NOT EXISTS qinban_identity.invite_codes (
 id uuid PRIMARY KEY,
 code_hash text NOT NULL UNIQUE,
 code_hint text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('operator','friend')),
 created_by uuid,
 max_uses integer NOT NULL CHECK(max_uses BETWEEN 1 AND 10000),
 uses integer NOT NULL DEFAULT 0 CHECK(uses>=0),
 bonus_tasks integer NOT NULL DEFAULT 0 CHECK(bonus_tasks BETWEEN 0 AND 1000),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=200),
 expires_at timestamptz,
 disabled_at timestamptz,
 created_at timestamptz NOT NULL,
 CHECK(uses<=max_uses)
);
CREATE INDEX IF NOT EXISTS invite_codes_creator ON qinban_identity.invite_codes(created_by,created_at);

-- One redemption per account; bonus_tasks is copied so later code edits never change a grant.
CREATE TABLE IF NOT EXISTS qinban_identity.invite_redemptions (
 id uuid PRIMARY KEY,
 code_id uuid NOT NULL REFERENCES qinban_identity.invite_codes(id),
 user_id uuid NOT NULL UNIQUE REFERENCES qinban_identity.users(id),
 bonus_tasks integer NOT NULL CHECK(bonus_tasks BETWEEN 0 AND 1000),
 redeemed_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS invite_redemptions_code ON qinban_identity.invite_redemptions(code_id);

-- The invite code typed at sign-up rides on the email challenge and is applied only
-- after the email is verified.
ALTER TABLE qinban_identity.challenges ADD COLUMN IF NOT EXISTS invite_code_id uuid;

-- One-time recognition task credits. A credit is used only after the monthly free
-- tasks run out; a job paid with a credit is marked so releasing it returns the credit.
CREATE TABLE IF NOT EXISTS qinban_control.task_credits (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL,
 amount integer NOT NULL CHECK(amount BETWEEN 1 AND 1000),
 source text NOT NULL,
 created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS task_credits_owner ON qinban_control.task_credits(owner_id);
ALTER TABLE qinban_control.job_index ADD COLUMN IF NOT EXISTS uses_credit boolean NOT NULL DEFAULT false;

-- Registration policy.
ALTER TABLE qinban_control.settings ADD COLUMN IF NOT EXISTS open_registration boolean NOT NULL DEFAULT true;
ALTER TABLE qinban_control.settings ADD COLUMN IF NOT EXISTS friend_invites_per_user integer NOT NULL DEFAULT 3 CHECK(friend_invites_per_user BETWEEN 0 AND 50);
ALTER TABLE qinban_control.settings ADD COLUMN IF NOT EXISTS friend_invite_bonus integer NOT NULL DEFAULT 2 CHECK(friend_invite_bonus BETWEEN 0 AND 100);

GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA qinban_identity TO qinban_identity;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA qinban_control TO qinban_library;
