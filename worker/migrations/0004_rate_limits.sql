-- 通用的失败次数限流（固定窗口），目前用于防止猜测文本快传的取件码
CREATE TABLE rate_limits (
  -- 如 paste:ip:1.2.3.4、paste:user:12
  key      TEXT    PRIMARY KEY,
  count    INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
CREATE INDEX idx_rate_limits_reset ON rate_limits (reset_at);
