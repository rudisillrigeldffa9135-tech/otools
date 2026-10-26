-- 待办清单：名称用清单所有者的密钥加密；共享成员记录在 todo_list_members
CREATE TABLE todo_lists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id   INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  color      TEXT    NOT NULL DEFAULT '',
  sort       REAL    NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_todo_lists_owner ON todo_lists (owner_id);

CREATE TABLE todo_list_members (
  list_id    INTEGER NOT NULL REFERENCES todo_lists (id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (list_id, user_id)
);
CREATE INDEX idx_todo_members_user ON todo_list_members (user_id);

-- 待办：标题、备注、子任务、标签加密存放在 data 中（用 key_owner_id 的密钥：共享清单里是清单所有者，收集箱里是本人）；
-- 日期、优先级、完成状态、重复规则、提醒时间为明文，用于筛选与定时提醒
CREATE TABLE todos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  -- 所属清单，NULL 为创建者自己的「收集箱」
  list_id       INTEGER REFERENCES todo_lists (id) ON DELETE CASCADE,
  -- 创建者
  user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key_owner_id  INTEGER NOT NULL,
  data          TEXT    NOT NULL,
  -- 'YYYY-MM-DD' 与 'HH:mm'，用户本地时间
  due_date      TEXT,
  due_time      TEXT,
  -- 0 无，1 低，2 中，3 高
  priority      INTEGER NOT NULL DEFAULT 0,
  done          INTEGER NOT NULL DEFAULT 0,
  done_at       INTEGER NOT NULL DEFAULT 0,
  done_by       INTEGER,
  -- 重复规则 JSON（见 src/pages-tools/todo/repeat.ts），repeat_anchor 为第一次的截止日期
  repeat        TEXT,
  repeat_anchor TEXT,
  -- 提前多少分钟提醒，NULL 不提醒；remind_at 为计算好的提醒时间（UTC 秒），0 表示无
  remind        INTEGER,
  remind_at     INTEGER NOT NULL DEFAULT 0,
  reminded      INTEGER NOT NULL DEFAULT 0,
  -- 与 Date.getTimezoneOffset() 相同含义（分钟），用于计算提醒时间与重复的下一次
  tz_offset     INTEGER NOT NULL DEFAULT -480,
  sort          REAL    NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX idx_todos_list ON todos (list_id, done);
CREATE INDEX idx_todos_user ON todos (user_id, list_id, done);
CREATE INDEX idx_todos_remind ON todos (remind_at) WHERE remind_at > 0 AND reminded = 0 AND done = 0;
CREATE INDEX idx_todos_done_at ON todos (done_at) WHERE done = 1;

-- 番茄钟专注记录（用于统计）
CREATE TABLE todo_focus (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  todo_id    INTEGER,
  minutes    INTEGER NOT NULL,
  ended_at   INTEGER NOT NULL
);
CREATE INDEX idx_todo_focus_user ON todo_focus (user_id, ended_at);

-- 每天完成数（用于统计；清空已完成的待办不影响统计）
CREATE TABLE todo_daily (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- 用户本地日期 'YYYY-MM-DD'
  day     TEXT    NOT NULL,
  done    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
