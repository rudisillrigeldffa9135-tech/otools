-- 密码库：是否保存了两步验证（TOTP）密钥。密钥本身和密码一起加密存放在 secret 中，这里只是列表展示用的标记
ALTER TABLE vault_items ADD COLUMN has_totp INTEGER NOT NULL DEFAULT 0;

-- 文本快传：内容用创建者的密钥加密（与密码库相同的方式），必须设置有效期
CREATE TABLE pastes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- 取件码，大写字母 + 数字（去掉易混淆字符）
  code            TEXT    NOT NULL UNIQUE,
  content         TEXT    NOT NULL,
  -- 原文字符数
  size            INTEGER NOT NULL,
  burn_after_read INTEGER NOT NULL DEFAULT 0,
  views           INTEGER NOT NULL DEFAULT 0,
  expires_at      INTEGER NOT NULL,
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_pastes_user ON pastes (user_id);
CREATE INDEX idx_pastes_expires ON pastes (expires_at);
