-- Markdown 便签：标题与正文一起加密存放在 data 中（与密码库相同的方式）
CREATE TABLE notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  data       TEXT    NOT NULL,
  -- 正文字符数
  size       INTEGER NOT NULL,
  pinned     INTEGER NOT NULL DEFAULT 0,
  -- 每次修改正文 +1，用于多设备同时编辑时检测冲突
  version    INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_notes_user ON notes (user_id, updated_at);
