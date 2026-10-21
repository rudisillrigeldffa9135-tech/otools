-- 便签分享密码：用作者的密钥加密保存（作者可以在分享设置里查看、复制），为空表示不需要密码
ALTER TABLE notes ADD COLUMN share_password TEXT;

-- 便签文件夹：名称加密保存；删除文件夹时其中的便签移到「未分类」
CREATE TABLE note_folders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_note_folders_user ON note_folders (user_id);

ALTER TABLE notes ADD COLUMN folder_id INTEGER;
CREATE INDEX idx_notes_folder ON notes (user_id, folder_id);

-- 便签历史版本：保存的是修改前的密文（与 notes.data 格式相同）。
-- 限制：同一便签 10 分钟内最多一个快照、每条最多 30 个、保留 90 天、每人历史总量 20 MB（见 worker/src/notes.ts）
CREATE TABLE note_versions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id    INTEGER NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  data       TEXT    NOT NULL,
  -- 正文字符数
  size       INTEGER NOT NULL,
  -- 密文字节数，用于统计占用空间
  bytes      INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_note_versions_note ON note_versions (note_id, created_at);
CREATE INDEX idx_note_versions_user ON note_versions (user_id, created_at);
