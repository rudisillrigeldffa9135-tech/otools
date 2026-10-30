-- WebShell：服务器、分组、快捷命令、密钥、已信任的主机密钥、终端设置全部在浏览器里用「主密码」端到端加密，
-- 服务端只保存密文，无法解密。

-- 每个用户一份：主密码派生密钥的参数（盐、迭代次数）与被它加密的数据密钥
CREATE TABLE webshell_vaults (
  user_id     INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  -- JSON：{ alg, iterations, salt }
  kdf         TEXT    NOT NULL,
  -- 用主密码派生的密钥加密的数据密钥（base64）
  wrapped_key TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- 加密的条目：id 由浏览器生成（UUID），rev 用于多设备同时修改时的冲突检测
CREATE TABLE webshell_items (
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  id         TEXT    NOT NULL,
  -- host / group / snippet / key / known_host / settings
  kind       TEXT    NOT NULL,
  data       TEXT    NOT NULL,
  rev        INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- 一次性连接票据（30 秒有效）：WebSocket 不能带 Authorization 头，先用登录态换票据，再凭票据建立中转
CREATE TABLE webshell_tickets (
  token_hash TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  host       TEXT    NOT NULL,
  port       INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- 中转连接记录：用于限制同时连接数，并在「连接记录」里给用户本人查看；保留 30 天
CREATE TABLE webshell_sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  host       TEXT    NOT NULL,
  port       INTEGER NOT NULL,
  client_ip  TEXT    NOT NULL DEFAULT '',
  started_at INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL,
  ended_at   INTEGER NOT NULL DEFAULT 0,
  bytes_in   INTEGER NOT NULL DEFAULT 0,
  bytes_out  INTEGER NOT NULL DEFAULT 0,
  error      TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX idx_webshell_sessions_user ON webshell_sessions (user_id, started_at);
