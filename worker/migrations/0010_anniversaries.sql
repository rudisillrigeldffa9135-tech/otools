-- 纪念日：标题、备注、表情加密存放在 data；日期规则为明文（用于计算提醒与日历订阅）
CREATE TABLE anniversaries (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  data             TEXT    NOT NULL,
  category         TEXT    NOT NULL DEFAULT 'other',
  color            TEXT    NOT NULL DEFAULT '',
  -- 日期规则：solar / lunar / weekday，见 src/pages-tools/anniversary/calc.ts
  calendar         TEXT    NOT NULL,
  year             INTEGER,
  month            INTEGER NOT NULL,
  day              INTEGER NOT NULL DEFAULT 1,
  leap             INTEGER NOT NULL DEFAULT 0,
  nth              INTEGER,
  weekday          INTEGER,
  repeat           INTEGER NOT NULL DEFAULT 1,
  count_from_one   INTEGER NOT NULL DEFAULT 1,
  leap_rule        TEXT    NOT NULL DEFAULT 'normal',
  feb29_rule       TEXT    NOT NULL DEFAULT 'feb28',
  -- 'HH:mm'：精确倒计时与提醒时刻，可为空
  time             TEXT,
  pinned           INTEGER NOT NULL DEFAULT 0,
  -- 提醒：提前天数 JSON 数组（如 [0,1,7]）、是否提醒里程碑；next_remind_at 为下一次提醒时间（UTC 秒），0 表示无
  remind_days      TEXT    NOT NULL DEFAULT '[]',
  remind_milestone INTEGER NOT NULL DEFAULT 0,
  next_remind_at   INTEGER NOT NULL DEFAULT 0,
  tz_offset        INTEGER NOT NULL DEFAULT -480,
  -- 只读分享（可选密码，密码用本人密钥加密）
  share_code       TEXT,
  share_password   TEXT,
  share_expires_at INTEGER NOT NULL DEFAULT 0,
  -- 自定义背景图在 R2 中的 key（keep/ 前缀，不自动删除）
  bg_key           TEXT,
  sort             REAL    NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX idx_anniversaries_user ON anniversaries (user_id);
CREATE INDEX idx_anniversaries_remind ON anniversaries (next_remind_at) WHERE next_remind_at > 0;
CREATE UNIQUE INDEX idx_anniversaries_share ON anniversaries (share_code) WHERE share_code IS NOT NULL;
