-- Run only with maintenance credentials. Hosted application roles never own tables.
DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='qinban_identity') THEN CREATE ROLE qinban_identity NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='qinban_library') THEN CREATE ROLE qinban_library NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$;
CREATE SCHEMA IF NOT EXISTS qinban_identity;
CREATE SCHEMA IF NOT EXISTS qinban_private;
CREATE TABLE IF NOT EXISTS qinban_identity.users (
 id uuid PRIMARY KEY,email text UNIQUE NOT NULL,state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','disabled','deletion_pending','deleting')),
 created_at timestamptz NOT NULL,verified_at timestamptz NOT NULL,delete_after timestamptz
);
CREATE TABLE IF NOT EXISTS qinban_identity.invitations (email text PRIMARY KEY,expires_at timestamptz NOT NULL,consumed_at timestamptz);
CREATE TABLE IF NOT EXISTS qinban_identity.challenges (
 id uuid PRIMARY KEY,email text NOT NULL,nonce_hash text NOT NULL,code_hmac text NOT NULL,purpose text NOT NULL,
 session_id uuid,attempts integer NOT NULL DEFAULT 0,expires_at timestamptz NOT NULL,consumed_at timestamptz,delivery_state text NOT NULL DEFAULT 'pending'
);
CREATE TABLE IF NOT EXISTS qinban_identity.sessions (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES qinban_identity.users(id),token_hash text UNIQUE NOT NULL,
 created_at timestamptz NOT NULL,last_seen_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,revoked_at timestamptz,reauthenticated_at timestamptz,
 purpose text NOT NULL DEFAULT 'normal',device text NOT NULL
);
CREATE TABLE IF NOT EXISTS qinban_identity.rate_limits (subject text NOT NULL,action text NOT NULL,bucket bigint NOT NULL,n integer NOT NULL,PRIMARY KEY(subject,action,bucket));
CREATE TABLE IF NOT EXISTS qinban_private.entries (
 id uuid PRIMARY KEY,owner_id uuid NOT NULL,document_id text NOT NULL,revision integer NOT NULL CHECK(revision>0),title text NOT NULL,
 instrument text NOT NULL,source_kind text NOT NULL,review_state text NOT NULL DEFAULT 'unreviewed',created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,deleted_at timestamptz,
 UNIQUE(owner_id,document_id),UNIQUE(owner_id,id)
);
CREATE TABLE IF NOT EXISTS qinban_private.revisions (
 owner_id uuid NOT NULL,entry_id uuid NOT NULL,revision integer NOT NULL,payload jsonb NOT NULL,snapshot_hash text NOT NULL,created_at timestamptz NOT NULL,
 PRIMARY KEY(owner_id,entry_id,revision),FOREIGN KEY(owner_id,entry_id) REFERENCES qinban_private.entries(owner_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS qinban_private.resources (
 id uuid PRIMARY KEY,owner_id uuid NOT NULL,sha256 text,mime_type text NOT NULL,byte_size bigint NOT NULL,state text NOT NULL,
 metadata jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL,UNIQUE(owner_id,id)
);
CREATE INDEX IF NOT EXISTS private_resources_owner_hash ON qinban_private.resources(owner_id,sha256);
CREATE TABLE IF NOT EXISTS qinban_private.uploads (
 id uuid PRIMARY KEY,owner_id uuid NOT NULL,resource_id uuid NOT NULL,payload jsonb NOT NULL,state text NOT NULL,expires_at timestamptz NOT NULL,
 UNIQUE(owner_id,id),FOREIGN KEY(owner_id,resource_id) REFERENCES qinban_private.resources(owner_id,id)
);
CREATE TABLE IF NOT EXISTS qinban_private.source_groups (
 id uuid PRIMARY KEY,owner_id uuid NOT NULL,kind text NOT NULL,pages jsonb NOT NULL,manifest_hash text NOT NULL,created_at timestamptz NOT NULL,UNIQUE(owner_id,id)
);
ALTER TABLE qinban_private.source_groups ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS qinban_private.group_resources (
 owner_id uuid NOT NULL,group_id uuid NOT NULL,resource_id uuid NOT NULL,PRIMARY KEY(owner_id,group_id,resource_id),
 FOREIGN KEY(owner_id,group_id) REFERENCES qinban_private.source_groups(owner_id,id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,resource_id) REFERENCES qinban_private.resources(owner_id,id)
);
CREATE TABLE IF NOT EXISTS qinban_private.revision_resources (
 owner_id uuid NOT NULL,entry_id uuid NOT NULL,revision integer NOT NULL,resource_id uuid NOT NULL,PRIMARY KEY(owner_id,entry_id,revision,resource_id),
 FOREIGN KEY(owner_id,entry_id,revision) REFERENCES qinban_private.revisions(owner_id,entry_id,revision) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,resource_id) REFERENCES qinban_private.resources(owner_id,id)
);
CREATE TABLE IF NOT EXISTS qinban_private.revision_sources (
 owner_id uuid NOT NULL,entry_id uuid NOT NULL,revision integer NOT NULL,group_id uuid NOT NULL,PRIMARY KEY(owner_id,entry_id,revision,group_id),
 FOREIGN KEY(owner_id,entry_id,revision) REFERENCES qinban_private.revisions(owner_id,entry_id,revision) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,group_id) REFERENCES qinban_private.source_groups(owner_id,id)
);
CREATE TABLE IF NOT EXISTS qinban_private.operations (
 id uuid PRIMARY KEY,owner_id uuid NOT NULL,kind text NOT NULL,payload jsonb NOT NULL,state text NOT NULL,expires_at timestamptz NOT NULL,UNIQUE(owner_id,id)
);
CREATE TABLE IF NOT EXISTS qinban_private.receipts (
 owner_id uuid NOT NULL,operation text NOT NULL,idempotency_key text NOT NULL,request_hash text NOT NULL,response jsonb NOT NULL,created_at timestamptz NOT NULL,
 PRIMARY KEY(owner_id,operation,idempotency_key)
);
CREATE TABLE IF NOT EXISTS qinban_private.audit (
 id uuid PRIMARY KEY,owner_id uuid NOT NULL,action text NOT NULL,target_id text NOT NULL,created_at timestamptz NOT NULL
);
DO $$ DECLARE t record; BEGIN FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='qinban_private' LOOP
 EXECUTE format('ALTER TABLE qinban_private.%I ENABLE ROW LEVEL SECURITY',t.tablename);
 EXECUTE format('ALTER TABLE qinban_private.%I FORCE ROW LEVEL SECURITY',t.tablename);
 IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname='qinban_private' AND tablename=t.tablename AND policyname='owner_only') THEN
 EXECUTE format('CREATE POLICY owner_only ON qinban_private.%I TO qinban_library USING (owner_id::text = current_setting(''app.user_id'',true)) WITH CHECK (owner_id::text = current_setting(''app.user_id'',true))',t.tablename); END IF;
END LOOP; END $$;
GRANT USAGE ON SCHEMA qinban_identity TO qinban_identity;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA qinban_identity TO qinban_identity;
GRANT USAGE ON SCHEMA qinban_private TO qinban_library;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA qinban_private TO qinban_library;
