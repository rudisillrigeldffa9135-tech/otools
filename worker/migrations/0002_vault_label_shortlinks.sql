-- 密码库：同一网站多个账号时用于区分的备注名，如「工作号」「小号」（明文，用于列表展示）
ALTER TABLE vault_items ADD COLUMN label TEXT NOT NULL DEFAULT '';

-- 短链接：code 区分大小写（BINARY 是 SQLite 默认排序规则）
CREATE TABLE short_links (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code            TEXT    NOT NULL UNIQUE,
  url             TEXT    NOT NULL,
  title           TEXT    NOT NULL DEFAULT '',
  clicks          INTEGER NOT NULL DEFAULT 0,
  last_clicked_at INTEGER NOT NULL DEFAULT 0,
  -- 0 表示永久有效
  expires_at      INTEGER NOT NULL DEFAULT 0,
  disabled        INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_short_links_user ON short_links (user_id);
