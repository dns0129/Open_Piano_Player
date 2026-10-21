-- Additive commercial schema; apply after accounts-v1.sql with maintenance credentials.
ALTER TABLE qinban_identity.users ADD COLUMN IF NOT EXISTS is_operator boolean NOT NULL DEFAULT false;
ALTER TABLE qinban_identity.invitations ADD COLUMN IF NOT EXISTS is_operator boolean NOT NULL DEFAULT false;
CREATE SCHEMA IF NOT EXISTS qinban_control;
CREATE TABLE IF NOT EXISTS qinban_control.settings (
 id integer PRIMARY KEY CHECK(id=1), revision integer NOT NULL DEFAULT 1,
 enabled boolean NOT NULL DEFAULT false, paused_reason text NOT NULL DEFAULT '',
 default_task_limit integer NOT NULL DEFAULT 5 CHECK(default_task_limit BETWEEN 0 AND 10000),
 daily_cap bigint NOT NULL DEFAULT 0 CHECK(daily_cap>=0), monthly_cap bigint NOT NULL DEFAULT 0 CHECK(monthly_cap>=0),
 job_cap bigint NOT NULL DEFAULT 0 CHECK(job_cap>=0), max_active integer NOT NULL DEFAULT 1 CHECK(max_active BETWEEN 1 AND 4),
 announcement text NOT NULL DEFAULT '', support_contact text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO qinban_control.settings(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS qinban_control.entitlements (owner_id uuid PRIMARY KEY, task_limit integer NOT NULL CHECK(task_limit BETWEEN 0 AND 10000));
CREATE TABLE IF NOT EXISTS qinban_control.job_index (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, period text NOT NULL, state text NOT NULL,
 slot_released boolean NOT NULL DEFAULT false, dispatched integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, lease_until timestamptz, worker_id uuid,
 cancel_requested boolean NOT NULL DEFAULT false, error_code text
);
CREATE INDEX IF NOT EXISTS commercial_queue ON qinban_control.job_index(state,created_at);
CREATE INDEX IF NOT EXISTS commercial_owner_period ON qinban_control.job_index(owner_id,period);
-- USD millionths. Amounts are app cost accounting at configured rates, not settled invoices.
CREATE TABLE IF NOT EXISTS qinban_control.attempts (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, job_id uuid NOT NULL, region_id text NOT NULL,
 day text NOT NULL, month text NOT NULL, state text NOT NULL, reserved bigint NOT NULL CHECK(reserved>=0),
 cost bigint NOT NULL CHECK(cost>=0), usage jsonb, rate_card jsonb NOT NULL,
 created_at timestamptz NOT NULL, settled_at timestamptz, resolution_note text,
 UNIQUE(job_id,region_id)
);
CREATE INDEX IF NOT EXISTS commercial_budget_period ON qinban_control.attempts(month,day);
CREATE TABLE IF NOT EXISTS qinban_control.feedback_index (id uuid PRIMARY KEY,owner_id uuid NOT NULL,state text NOT NULL,created_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS qinban_control.audit (id uuid PRIMARY KEY,actor_id uuid,action text NOT NULL,target text NOT NULL,details jsonb NOT NULL,created_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS qinban_private.recognition_jobs (
 id uuid PRIMARY KEY,owner_id uuid NOT NULL,source_group_id uuid NOT NULL,manifest jsonb NOT NULL,
 state text NOT NULL,result_entry_id uuid,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,
 UNIQUE(owner_id,id),FOREIGN KEY(owner_id,source_group_id) REFERENCES qinban_private.source_groups(owner_id,id)
);
CREATE TABLE IF NOT EXISTS qinban_private.recognition_regions (
 owner_id uuid NOT NULL,job_id uuid NOT NULL,region_id text NOT NULL,ordinal integer NOT NULL,
 state text NOT NULL,result jsonb,crop_resource_id uuid,error_code text,
 PRIMARY KEY(owner_id,job_id,region_id),FOREIGN KEY(owner_id,job_id) REFERENCES qinban_private.recognition_jobs(owner_id,id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,crop_resource_id) REFERENCES qinban_private.resources(owner_id,id)
);
CREATE TABLE IF NOT EXISTS qinban_private.job_resources (
 owner_id uuid NOT NULL,job_id uuid NOT NULL,resource_id uuid NOT NULL,PRIMARY KEY(owner_id,job_id,resource_id),
 FOREIGN KEY(owner_id,job_id) REFERENCES qinban_private.recognition_jobs(owner_id,id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,resource_id) REFERENCES qinban_private.resources(owner_id,id)
);
CREATE TABLE IF NOT EXISTS qinban_private.feedback (
 id uuid PRIMARY KEY,owner_id uuid NOT NULL,job_id uuid,category text NOT NULL,message text NOT NULL,
 state text NOT NULL DEFAULT 'open',reply text NOT NULL DEFAULT '',created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL
);
DO $$ DECLARE name text; BEGIN FOREACH name IN ARRAY ARRAY['recognition_jobs','recognition_regions','job_resources','feedback'] LOOP
 EXECUTE format('ALTER TABLE qinban_private.%I ENABLE ROW LEVEL SECURITY',name);
 EXECUTE format('ALTER TABLE qinban_private.%I FORCE ROW LEVEL SECURITY',name);
 IF NOT EXISTS(SELECT FROM pg_policies WHERE schemaname='qinban_private' AND tablename=name AND policyname='owner_only') THEN
 EXECUTE format('CREATE POLICY owner_only ON qinban_private.%I TO qinban_library USING (owner_id::text=current_setting(''app.user_id'',true)) WITH CHECK (owner_id::text=current_setting(''app.user_id'',true))',name); END IF;
END LOOP; END $$;
GRANT USAGE ON SCHEMA qinban_control TO qinban_library;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA qinban_control TO qinban_library;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA qinban_private TO qinban_library;
