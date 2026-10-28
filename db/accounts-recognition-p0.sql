-- Preserve every original attempt and cost. One row may now have one repair,
-- separately reserved and settled; never overwrite the first billed request.
ALTER TABLE qinban_control.attempts
 ADD COLUMN IF NOT EXISTS attempt integer NOT NULL DEFAULT 1 CHECK (attempt BETWEEN 1 AND 2);
ALTER TABLE qinban_control.attempts DROP CONSTRAINT IF EXISTS attempts_job_id_region_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS commercial_region_attempt
 ON qinban_control.attempts(job_id,region_id,attempt);
