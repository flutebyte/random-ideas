CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key   TEXT NOT NULL UNIQUE,
  event_type  TEXT NOT NULL,
  payload     TEXT,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','failed','done')),
  lease_until INTEGER,
  attempts    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS jobs (
  source   TEXT NOT NULL,
  job_id   TEXT NOT NULL,
  title    TEXT,
  url      TEXT,
  PRIMARY KEY (source, job_id)
);

CREATE TABLE IF NOT EXISTS poller_state (
  source        TEXT PRIMARY KEY,
  etag          TEXT,
  baselined     INTEGER NOT NULL DEFAULT 0,
  failures      INTEGER NOT NULL DEFAULT 0,
  backoff_until INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS scores (
  source     TEXT NOT NULL,
  job_id     TEXT NOT NULL,
  score      INTEGER NOT NULL,
  reason     TEXT NOT NULL,
  stage      TEXT NOT NULL CHECK (stage IN ('filtered','llm')),
  model      TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (source, job_id)
);

CREATE TABLE IF NOT EXISTS job_details (
  source      TEXT NOT NULL,
  job_id      TEXT NOT NULL,
  location    TEXT,
  description TEXT,
  PRIMARY KEY (source, job_id)
);

CREATE TABLE IF NOT EXISTS applications (
  source       TEXT NOT NULL,
  job_id       TEXT NOT NULL,
  bullets      TEXT,            -- JSON list of {text, fact_ids}
  cover_letter TEXT,            -- JSON list of {text, fact_ids}
  factcheck    TEXT,            -- JSON list of problems ([] = passed)
  status       TEXT NOT NULL CHECK (status IN
               ('tailored','factcheck_failed','filled','needs_input','approved','submitted','rejected','skipped','error')),
  mode         TEXT NOT NULL DEFAULT 'manual' CHECK (mode IN ('manual','auto')),
  payload      TEXT,            -- JSON of what was typed into the form
  screenshot   TEXT,
  created_at   INTEGER NOT NULL,
  submitted_at INTEGER,
  PRIMARY KEY (source, job_id)
);

CREATE TABLE IF NOT EXISTS approvals (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,     -- 'application' | 'email_draft'
  ref        TEXT NOT NULL,     -- 'source:job_id' or email msg_key
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  UNIQUE (kind, ref)
);

CREATE TABLE IF NOT EXISTS mail_state (
  mailbox     TEXT PRIMARY KEY,
  uidvalidity INTEGER,
  last_uid    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS emails (
  msg_key    TEXT PRIMARY KEY,  -- 'mailbox:uidvalidity:uid'
  sender     TEXT,
  subject    TEXT,
  body       TEXT,
  class      TEXT,
  action     TEXT,
  draft      TEXT,
  state      TEXT NOT NULL DEFAULT 'new' CHECK (state IN ('new','done','ignored','error')),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kv (
  k TEXT PRIMARY KEY,
  v TEXT
);

CREATE TABLE IF NOT EXISTS cli_replies (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL
);
