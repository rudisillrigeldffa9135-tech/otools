# WebShell 连接 Cloudflare Tunnel 服务器：配置教程

没有公网 IP 的服务器（家里的 NAS、公司内网机器、只有内网地址的云主机），可以用 Cloudflare Tunnel 把 SSH 发布到一个域名上，再在 WebShell 里选择「Cloudflare Tunnel」连接方式连接。

整个过程**服务器不需要开放任何入站端口**，SSH 前面还多了一道 Cloudflare Access 门禁。

```
浏览器（WebShell，SSH 加密在这里完成）
  → otools 中转（只转发加密字节）
  → Cloudflare 边缘：Access 校验服务令牌
  → Tunnel → 服务器上的 cloudflared → localhost:22
```

> Cloudflare 后台的菜单名称偶尔会调整。下文写的是 Zero Trust 控制台的常见路径，找不到时可以用控制台顶部的搜索框搜关键词（如 "Tunnels"、"Service Tokens"、"Applications"）。

---

## 准备

- 一个已接入 Cloudflare 的域名（下文以 `example.com` 为例）。
- 服务器能访问外网（cloudflared 只需要出站连接）。
- 服务器上的 SSH 服务在运行（默认 `localhost:22`）。

---

## 第一步：创建 Tunnel，把 SSH 发布到一个子域名

**如果你已经能用 `cloudflared access ssh --hostname ssh.example.com` 连上这台服务器，说明这一步已经做好了，直接跳到第二步。**

### 方式 A：在控制台里操作（推荐）

1. 打开 [Cloudflare Zero Trust 控制台](https://one.dash.cloudflare.com/) → **Networks → Tunnels** → **Create a tunnel**。
2. 类型选 **Cloudflared**，起个名字（如 `home-nas`）→ 保存。
3. 页面会给出一条安装命令（区分操作系统），复制到服务器上执行。执行后页面显示 Connector 状态为 **Healthy**。
4. 进入 **Public Hostname**（公共主机名）页，点 **Add a public hostname**：
   - Subdomain：`ssh`
   - Domain：`example.com`
   - Service Type：**SSH**
   - URL：`localhost:22`
5. 保存。现在 `ssh.example.com` 就指向了这台服务器的 SSH。

### 方式 B：配置文件（本地管理的 Tunnel）

在 `~/.cloudflared/config.yml` 中加入 ingress 规则，然后重启 cloudflared：

```yaml
tunnel: <你的 Tunnel ID>
credentials-file: /root/.cloudflared/<你的 Tunnel ID>.json
ingress:
  - hostname: ssh.example.com
    service: ssh://localhost:22
  - service: http_status:404
```

```bash
cloudflared tunnel route dns <Tunnel 名称> ssh.example.com
```

> ⚠️ **做完第一步后，务必立刻做第二、三步。** 在配置 Access 之前，任何知道这个域名的人都能通过 Tunnel 连到你的 SSH 端口。

---

## 第二步：创建服务令牌（Service Token）

服务令牌是给程序用的「账号密码」，WebShell 用它通过 Access 校验。

1. Zero Trust 控制台 → **Access → Service credentials（服务凭据）→ Service Tokens** → **Create Service Token**。
2. 名称填 `otools-webshell`。
3. **Service Token Duration（有效期）**：建议选 1 年。到期前 Cloudflare 会发邮件提醒，到时按文末的「轮换令牌」更换。
4. 点 **Generate token**，页面会显示两项：
   - **Client ID**：形如 `xxxxxxxx.access`
   - **Client Secret**：一长串字符

   **Client Secret 只显示这一次**，请立刻复制保存（比如先存进本站的「密码管理」）。

---

## 第三步：用 Access 应用保护这个域名

1. Zero Trust 控制台 → **Access → Applications** → **Add an application** → 选 **Self-hosted（自托管）**。
2. **Application name**：`SSH - home-nas`
3. **Application domain / Public hostname**：Subdomain 填 `ssh`，Domain 选 `example.com`，Path 留空。
4. 下一步进入 **Policies（策略）**，添加两条：

   **策略 1：给 WebShell 用**
   - Policy name：`WebShell 服务令牌`
   - **Action：Service Auth**（注意不是 Allow。Service Auth 才允许不经过登录页、直接用令牌访问）
   - Include（包含）：Selector 选 **Service Token**，值选第二步建的 `otools-webshell`

   **策略 2：给你自己的电脑命令行用（可选）**
   - Policy name：`本人`
   - Action：**Allow**
   - Include：Selector 选 **Emails**，填你自己的邮箱

   有了策略 2，电脑上的 `cloudflared access ssh` 会打开浏览器让你邮箱登录一次，之后照常使用。
5. 其余保持默认，保存。

### 验证 Access 已经生效

在任意电脑上运行：

```bash
curl -sI https://ssh.example.com
```

看到 `HTTP/2 302`，并且 `location:` 指向 `xxx.cloudflareaccess.com`，就说明域名已经受 Access 保护。

---

## 第四步：在 WebShell 里添加服务器

1. 打开 WebShell → **新建服务器**。
2. **连接方式**选 **Cloudflare Tunnel**。
3. **Tunnel 域名**填 `ssh.example.com`。粘贴 `https://ssh.example.com/` 也可以，保存时会自动只留域名。
4. **Access 服务令牌**：填第二步得到的 Client ID 和 Client Secret。
5. 用户名、认证方式（密码 / 私钥）和平常一样填写，然后点**保存并连接**。

第一次连接会提示确认服务器指纹（和普通 SSH 一样），确认后即可使用终端、SFTP、监控等全部功能。

> 已经在 `~/.ssh/config` 里用 `ProxyCommand cloudflared access ssh --hostname %h` 的主机，可以用 WebShell 的「导入 SSH 配置」直接导入，会自动识别为 Cloudflare Tunnel。服务令牌不会从配置文件导入，需要在编辑服务器时补填。

---

## 常见错误

| WebShell 提示 | 原因与处理 |
|---|---|
| 该域名受 Cloudflare Access 保护，请在服务器设置中填写服务令牌 | 没填令牌。编辑服务器，填上 Client ID 和 Client Secret |
| Cloudflare Access 拒绝了服务令牌… | 令牌填错或已过期；或者 Access 策略的 Action 不是 **Service Auth**、Include 里没选这个令牌 |
| Tunnel 不在线… | 服务器上的 cloudflared 没在运行，或 Public Hostname 里没有这个域名。在服务器上运行 `systemctl status cloudflared` 检查 |
| 该域名不是 SSH 隧道… | 这个域名的 Service Type 不是 SSH（比如配成了 HTTP），改为 SSH、URL 为 `localhost:22` |
| 域名解析失败 | 域名写错，或 DNS 记录没建好（方式 B 需要执行 `cloudflared tunnel route dns`） |
| 终端里出现黄色提示「未受 Cloudflare Access 保护」 | 连接成功了，但这个域名没有 Access 保护，任何人都能连到你的 SSH。请按第二、三步配置 |
| 概览里显示「受 Cloudflare Access 保护，无法检测 cloudflared 是否在线」 | 正常现象。在线检测不会携带令牌，只能确认域名可达；能不能连上，以实际连接为准 |

---

## 安全说明

**令牌存放与使用方式**
- 服务令牌和服务器密码一样，先在浏览器里用你的**主密码**加密，再同步到云端。服务端只保存密文。
- 连接时，令牌只通过加密的 WebSocket 发给 otools 中转，只在这条连接存续期间保存在中转内存里，**不写数据库，也不写日志**。
- SSH 本身是端到端加密的：中转和 Cloudflare 只能看到加密后的字节，看不到密码、私钥、命令和输出。

**有两道门**
- 想登录服务器，必须**同时**拿到服务令牌（过 Access）和 SSH 密码或私钥（过 sshd）。
- 令牌泄露不等于服务器被攻破，但仍应立即轮换。

**建议**
- 一个服务令牌只放进一个 Access 应用的策略里，不要多个应用共用。
- sshd 尽量只允许私钥登录：在 `/etc/ssh/sshd_config` 里设置 `PasswordAuthentication no`。
- 如果之前在路由器上做过 22 端口转发，可以关掉了。
- 不再使用的 Tunnel 公共主机名，记得同时删除 Public Hostname 和对应的 DNS 记录。

---

## 轮换令牌（到期或怀疑泄露时）

1. Zero Trust 控制台 → Access → Service Tokens → 新建一个令牌（如 `otools-webshell-2027`）。
2. 打开第三步的 Access 应用 → 编辑「WebShell 服务令牌」策略 → 在 Include 里**加上**新令牌（暂时保留旧令牌）。
3. 在 WebShell 里编辑服务器，换成新的 Client ID 和 Client Secret，连接一次确认可用。
4. 回到策略里去掉旧令牌，再在 Service Tokens 里删除旧令牌（或点 Revoke）。
