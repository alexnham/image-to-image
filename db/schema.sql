-- Run once in the Neon SQL editor.
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  image_pathname text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS projects_user_id_idx ON projects (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS accounts (
  user_id text PRIMARY KEY,
  prompts_used integer NOT NULL DEFAULT 0 CHECK (prompts_used BETWEEN 0 AND 20),
  lock_token uuid,
  locked_until timestamptz,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS versions (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number integer NOT NULL,
  layers jsonb NOT NULL,
  prompt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, number)
);
CREATE TABLE IF NOT EXISTS assets (
  pathname text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS monthly_budget (
  month text PRIMARY KEY,
  spent_micros bigint NOT NULL DEFAULT 0,
  alerted boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS provider_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month text NOT NULL REFERENCES monthly_budget(month),
  kind text NOT NULL,
  reserved_micros bigint NOT NULL,
  actual_micros bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
