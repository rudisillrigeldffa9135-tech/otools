-- 归属查询：主体（手机号/邮箱/卡）、平台账号、具体资产（C）
-- 敏感备注信息用 AES-GCM 加密后存入 secret_data

CREATE TABLE whereis_subjects (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type         TEXT    NOT NULL, -- phone / email / bankcard / idcard / entity / other
  name         TEXT    NOT NULL, -- 别名: 如 "工作手机号", "招行卡"
  masked_value TEXT    NOT NULL DEFAULT '', -- 脱敏展示值: 如 "138****0000"
  secret_data  TEXT    NOT NULL DEFAULT '', -- 加密后的真实数据或备注
  sort         REAL    NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_whereis_subjects_user ON whereis_subjects (user_id);

CREATE TABLE whereis_accounts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  subject_id   INTEGER REFERENCES whereis_subjects (id) ON DELETE SET NULL,
  platform     TEXT    NOT NULL, -- 平台名称: 如 "阿里云", "Cloudflare", "GitHub"
  account_name TEXT    NOT NULL DEFAULT '', -- 登录账号名: 如 "admin@corp.com"
  login_url    TEXT    NOT NULL DEFAULT '', -- 后台登录链接
  icon         TEXT    NOT NULL DEFAULT '', -- 图标类名
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_whereis_accounts_user ON whereis_accounts (user_id);
CREATE INDEX idx_whereis_accounts_subject ON whereis_accounts (subject_id);

CREATE TABLE whereis_assets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  account_id   INTEGER NOT NULL REFERENCES whereis_accounts (id) ON DELETE CASCADE,
  category     TEXT    NOT NULL DEFAULT 'other', -- domain / server / subscription / api_key / footprint / hardware / other
  name         TEXT    NOT NULL, -- 资产名称 C: 如 "api.domain.com", "43.153.x.x"
  tags         TEXT    NOT NULL DEFAULT '[]', -- JSON 字符串数组
  expire_at    INTEGER NOT NULL DEFAULT 0, -- 到期时间戳(秒)，0 表示无
  cost_cycle   TEXT    NOT NULL DEFAULT '', -- 费用周期: 如 "¥99/年", "$20/月"
  status       TEXT    NOT NULL DEFAULT 'active', -- active / expiring / expired / lend / archived
  extra        TEXT    NOT NULL DEFAULT '{}', -- 扩展字段 JSON: 如备注、DNS解析商、借调人等
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_whereis_assets_user ON whereis_assets (user_id);
CREATE INDEX idx_whereis_assets_account ON whereis_assets (account_id);
CREATE INDEX idx_whereis_assets_expire ON whereis_assets (expire_at) WHERE expire_at > 0;
