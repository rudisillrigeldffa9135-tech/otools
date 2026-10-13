-- 文本快传：分享链接是否直接打开纯文本页面（类似 GitHub 的 Raw）
ALTER TABLE pastes ADD COLUMN raw INTEGER NOT NULL DEFAULT 0;
-- expires_at 为 0 表示永久有效；不需要取件码的快传使用 16 位链接码（只能通过链接打开，无法被穷举）
