-- User-defined sessions: working directories, commands, notes, and linked agent sessions.
CREATE TABLE IF NOT EXISTS user_sessions (
  id                      TEXT PRIMARY KEY,
  name                    TEXT NOT NULL,
  working_dirs            TEXT NOT NULL DEFAULT '[]',
  commands                TEXT NOT NULL DEFAULT '[]',
  notes                   TEXT NOT NULL DEFAULT '',
  linked_agent_session_ids TEXT NOT NULL DEFAULT '[]',
  pinned                  INTEGER NOT NULL DEFAULT 0,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
