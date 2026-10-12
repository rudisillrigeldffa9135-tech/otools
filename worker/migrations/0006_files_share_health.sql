-- 密码体检：记录密码最后一次修改的时间（只改网站名、备注等不算）
ALTER TABLE vault_items ADD COLUMN password_updated_at INTEGER NOT NULL DEFAULT 0;
UPDATE vault_items SET password_updated_at = updated_at;

-- 便签分享：只读链接，share_expires_at 为 0 表示永久有效
ALTER TABLE notes ADD COLUMN share_code TEXT;
ALTER TABLE notes ADD COLUMN share_expires_at INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX idx_notes_share ON notes (share_code) WHERE share_code IS NOT NULL;

-- 文件快传：文件本体存放在 R2，这里只存元数据；过期后由定时任务删除 R2 对象与本行
CREATE TABLE files (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code            TEXT    NOT NULL UNIQUE,
  r2_key          TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  size            INTEGER NOT NULL,
  mime            TEXT    NOT NULL DEFAULT 'application/octet-stream',
  burn_after_read INTEGER NOT NULL DEFAULT 0,
  -- 阅后即焚的文件被他人下载后置 1，随即不可再下载，稍后由定时任务清理
  burned          INTEGER NOT NULL DEFAULT 0,
  downloads       INTEGER NOT NULL DEFAULT 0,
  expires_at      INTEGER NOT NULL,
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_files_user ON files (user_id);
CREATE INDEX idx_files_expires ON files (expires_at);

-- 通用缓存（workers.dev 域名下 Cache API 不可用），目前用于汇率
CREATE TABLE cache (
  key        TEXT    PRIMARY KEY,
  value      TEXT    NOT NULL,
  expires_at INTEGER NOT NULL
);
