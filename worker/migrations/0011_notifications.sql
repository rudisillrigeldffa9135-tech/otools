-- 站内提醒：由定时任务生成（待办提醒、纪念日提醒、里程碑），内容加密；保留 30 天
CREATE TABLE notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- todo / anniversary / milestone / test
  kind       TEXT    NOT NULL,
  ref_id     INTEGER,
  -- 加密的 { title, body, url }
  data       TEXT    NOT NULL,
  read_at    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_notifications_user ON notifications (user_id, created_at);

-- 浏览器推送订阅（Web Push）
CREATE TABLE push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  endpoint   TEXT    NOT NULL UNIQUE,
  p256dh     TEXT    NOT NULL,
  auth       TEXT    NOT NULL,
  -- 订阅时的站点地址，用作 VAPID 的 subject 与通知点击后打开的地址
  origin     TEXT    NOT NULL,
  user_agent TEXT    NOT NULL DEFAULT '',
  fail_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_push_user ON push_subscriptions (user_id);

-- 日历订阅：链接里的随机令牌只存 SHA-256（用于查找）与加密副本（方便本人再次复制链接）
ALTER TABLE users ADD COLUMN cal_token_hash TEXT;
ALTER TABLE users ADD COLUMN cal_token_enc TEXT;
CREATE UNIQUE INDEX idx_users_cal_token ON users (cal_token_hash) WHERE cal_token_hash IS NOT NULL;
