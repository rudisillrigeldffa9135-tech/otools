-- WebShell 支持经 Cloudflare Tunnel 连接：票据与连接记录增加连接方式
-- via：'' 直连 TCP；'cftunnel' 以 WebSocket 连接 Tunnel 域名（与 cloudflared access ssh 相同的协议）
ALTER TABLE webshell_tickets ADD COLUMN via TEXT NOT NULL DEFAULT '';
ALTER TABLE webshell_sessions ADD COLUMN via TEXT NOT NULL DEFAULT '';
