//go:build js && wasm

package main

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"sync"
	"syscall/js"
	"time"

	"golang.org/x/crypto/ssh"
)

type client struct {
	ssh  *ssh.Client
	conn net.Conn

	mu       sync.Mutex
	sessions map[int]bool
	sftps    map[int]bool
	closed   bool
}

var clients = newRegistry[*client]()

// 兼容老旧服务器：在安全算法之后追加不安全的算法（只在服务器不支持安全算法时才会选中）
func algorithms() ssh.Algorithms {
	s, ins := ssh.SupportedAlgorithms(), ssh.InsecureAlgorithms()
	return ssh.Algorithms{
		KeyExchanges: append(s.KeyExchanges, ins.KeyExchanges...),
		Ciphers:      append(s.Ciphers, ins.Ciphers...),
		MACs:         append(s.MACs, ins.MACs...),
		HostKeys:     append(s.HostKeys, ins.HostKeys...),
	}
}

// connect(opts) => Promise<{ id, serverVersion }>
//
//	opts.transport  createTransport 返回的 id（直连）
//	opts.via        已连接的客户端 id（经跳板机连接，通过它转发到 host:port）
//	opts.host / port / username / password / privateKey / passphrase
//	opts.keepalive  保活间隔（秒），0 关闭，默认 30
//	opts.timeout    握手超时（毫秒），默认 20000
//	opts.onHostKey(info) => boolean | Promise<boolean>
//	opts.onPrompt({ name, instruction, questions: [{ prompt, echo }] }) => string[] | null | Promise
//	opts.onBanner(text)
//	opts.onClose(reason)
func connect(this js.Value, args []js.Value) any {
	opts := arg(args, 0)
	return promise(func() (any, error) {
		host := optString(opts, "host")
		port := optInt(opts, "port", 22)
		addr := net.JoinHostPort(host, strconv.Itoa(port))
		timeout := time.Duration(optInt(opts, "timeout", 20000)) * time.Millisecond

		var conn net.Conn
		if via := optInt(opts, "via", 0); via > 0 {
			jump, ok := clients.get(via)
			if !ok {
				return nil, newCoded("jump", "跳板机连接已断开")
			}
			c, err := dialWithTimeout(jump.ssh, addr, timeout)
			if err != nil {
				return nil, newCoded("jump", "跳板机无法连接目标服务器："+err.Error())
			}
			conn = c
		} else {
			t, ok := transports.get(optInt(opts, "transport", 0))
			if !ok {
				return nil, newCoded("network", "连接通道不存在")
			}
			conn = t
		}

		cfg := &ssh.ClientConfig{
			User:              optString(opts, "username"),
			Config:            ssh.Config{KeyExchanges: algorithms().KeyExchanges, Ciphers: algorithms().Ciphers, MACs: algorithms().MACs},
			HostKeyAlgorithms: algorithms().HostKeys,
			Timeout:           timeout,
			ClientVersion:     "SSH-2.0-OTools_WebShell",
			HostKeyCallback:   hostKeyCallback(opts),
			BannerCallback: func(message string) error {
				if fn, ok := optFunc(opts, "onBanner"); ok {
					fn.Invoke(message)
				}
				return nil
			},
		}
		auths, err := authMethods(opts)
		if err != nil {
			conn.Close()
			return nil, err
		}
		cfg.Auth = auths

		// 握手超时：到点关闭底层连接，让握手立即失败
		timer := time.AfterFunc(timeout, func() { conn.Close() })
		sc, chans, reqs, err := ssh.NewClientConn(conn, addr, cfg)
		stopped := timer.Stop()
		if err != nil {
			conn.Close()
			if !stopped {
				return nil, newCoded("timeout", "连接超时，请检查地址、端口与网络")
			}
			return nil, classify(err)
		}
		cl := &client{ssh: ssh.NewClient(sc, chans, reqs), conn: conn, sessions: map[int]bool{}, sftps: map[int]bool{}}
		id := clients.add(cl)

		if ka := optInt(opts, "keepalive", 30); ka > 0 {
			go keepalive(cl, time.Duration(ka)*time.Second)
		}
		go func() {
			err := cl.ssh.Wait()
			reason := "连接已断开"
			if err != nil && !errors.Is(err, io.EOF) && !strings.Contains(err.Error(), "use of closed") {
				reason = "连接已断开：" + err.Error()
			}
			cl.shutdown()
			clients.remove(id)
			if fn, ok := optFunc(opts, "onClose"); ok {
				fn.Invoke(reason)
			}
		}()
		return object(map[string]any{"id": id, "serverVersion": string(sc.ServerVersion())}), nil
	})
}

func dialWithTimeout(c *ssh.Client, addr string, timeout time.Duration) (net.Conn, error) {
	type res struct {
		c   net.Conn
		err error
	}
	ch := make(chan res, 1)
	go func() {
		c, err := c.Dial("tcp", addr)
		ch <- res{c, err}
	}()
	select {
	case r := <-ch:
		return r.c, r.err
	case <-time.After(timeout):
		go func() {
			if r := <-ch; r.c != nil {
				r.c.Close()
			}
		}()
		return nil, errors.New("超时")
	}
}

func classify(err error) error {
	msg := err.Error()
	switch {
	case strings.Contains(msg, "unable to authenticate"), strings.Contains(msg, "no supported methods remain"),
		// 服务器不发提问直接拒绝键盘交互认证时，x/crypto 报「意外的消息 51」，实际就是认证失败
		strings.Contains(msg, "unexpected message type 51"):
		return newCoded("auth", "认证失败：用户名、密码或私钥不正确")
	case strings.Contains(msg, "host key rejected"):
		return newCoded("hostkey", "已取消：未信任服务器的主机密钥")
	case strings.Contains(msg, "handshake failed: EOF"), errors.Is(err, io.EOF):
		return newCoded("network", "连接被服务器关闭，请检查地址与端口是否为 SSH 服务")
	case strings.Contains(msg, "no common algorithm"):
		return newCoded("algorithm", "与服务器没有共同支持的加密算法："+msg)
	}
	return newCoded("ssh", msg)
}

var errHostKeyRejected = errors.New("host key rejected")

func hostKeyCallback(opts js.Value) ssh.HostKeyCallback {
	return func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		fn, ok := optFunc(opts, "onHostKey")
		if !ok {
			return errHostKeyRejected
		}
		info := object(map[string]any{
			"type":        key.Type(),
			"fingerprint": ssh.FingerprintSHA256(key),
			"key":         base64.StdEncoding.EncodeToString(key.Marshal()),
		})
		v, err := await(fn.Invoke(info))
		if err != nil || !v.Truthy() {
			return errHostKeyRejected
		}
		return nil
	}
}

func authMethods(opts js.Value) ([]ssh.AuthMethod, error) {
	var methods []ssh.AuthMethod
	if pem := optString(opts, "privateKey"); pem != "" {
		signer, err := parseSigner(pem, optString(opts, "passphrase"))
		if err != nil {
			return nil, err
		}
		methods = append(methods, ssh.PublicKeys(signer))
	}
	password := optString(opts, "password")
	if password != "" {
		methods = append(methods, ssh.Password(password))
	}
	// 键盘交互：只问一次密码时自动用已保存的密码回答，其余（如动态口令）交给前端弹窗
	usedPassword := false
	methods = append(methods, ssh.KeyboardInteractive(func(name, instruction string, questions []string, echos []bool) ([]string, error) {
		if len(questions) == 0 {
			return nil, nil
		}
		if password != "" && !usedPassword && len(questions) == 1 && !echos[0] && strings.Contains(strings.ToLower(questions[0]), "password") {
			usedPassword = true
			return []string{password}, nil
		}
		fn, ok := optFunc(opts, "onPrompt")
		if !ok {
			return nil, errors.New("服务器要求交互式认证")
		}
		qs := jsArray.New()
		for i, q := range questions {
			qs.Call("push", object(map[string]any{"prompt": q, "echo": echos[i]}))
		}
		v, err := await(fn.Invoke(object(map[string]any{"name": name, "instruction": instruction, "questions": qs})))
		if err != nil || v.Type() != js.TypeObject {
			return nil, errors.New("已取消认证")
		}
		answers := make([]string, v.Length())
		for i := range answers {
			answers[i] = v.Index(i).String()
		}
		return answers, nil
	}))
	return methods, nil
}

func parseSigner(pem, passphrase string) (ssh.Signer, error) {
	var signer ssh.Signer
	var err error
	if passphrase != "" {
		signer, err = ssh.ParsePrivateKeyWithPassphrase([]byte(pem), []byte(passphrase))
	} else {
		signer, err = ssh.ParsePrivateKey([]byte(pem))
	}
	if err != nil {
		var missing *ssh.PassphraseMissingError
		if errors.As(err, &missing) {
			return nil, newCoded("passphrase", "私钥已加密，请填写私钥密码")
		}
		if strings.Contains(err.Error(), "decryption password incorrect") {
			return nil, newCoded("passphrase", "私钥密码不正确")
		}
		return nil, newCoded("key", "无法解析私钥："+err.Error())
	}
	return signer, nil
}

func keepalive(cl *client, interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	misses := 0
	for range t.C {
		cl.mu.Lock()
		closed := cl.closed
		cl.mu.Unlock()
		if closed {
			return
		}
		done := make(chan error, 1)
		go func() {
			_, _, err := cl.ssh.SendRequest("keepalive@openssh.com", true, nil)
			done <- err
		}()
		select {
		case err := <-done:
			if err != nil {
				cl.ssh.Close()
				return
			}
			misses = 0
		case <-time.After(interval):
			misses++
			if misses >= 3 {
				cl.ssh.Close()
				return
			}
		}
	}
}

func (cl *client) shutdown() {
	cl.mu.Lock()
	cl.closed = true
	sessions, sftps := cl.sessions, cl.sftps
	cl.sessions, cl.sftps = map[int]bool{}, map[int]bool{}
	cl.mu.Unlock()
	for id := range sessions {
		if s, ok := sessionsReg.remove(id); ok {
			s.close()
		}
	}
	for id := range sftps {
		if s, ok := sftpReg.remove(id); ok {
			s.Close()
		}
	}
	cl.conn.Close()
}

// disconnect(id)
func disconnect(this js.Value, args []js.Value) any {
	id := arg(args, 0).Int()
	return promise(func() (any, error) {
		if cl, ok := clients.get(id); ok {
			cl.ssh.Close()
			cl.conn.Close()
		}
		return nil, nil
	})
}

/* ---------------- 交互式终端 ---------------- */

type session struct {
	s     *ssh.Session
	stdin io.WriteCloser

	mu     sync.Mutex
	cond   *sync.Cond
	queue  [][]byte
	closed bool
}

var sessionsReg = newRegistry[*session]()

// 写入按顺序排队，由单独的 goroutine 发出，避免 JS 回调被流控阻塞
func (s *session) enqueue(b []byte) {
	s.mu.Lock()
	if !s.closed {
		s.queue = append(s.queue, b)
	}
	s.mu.Unlock()
	s.cond.Signal()
}

func (s *session) writer() {
	for {
		s.mu.Lock()
		for len(s.queue) == 0 && !s.closed {
			s.cond.Wait()
		}
		if s.closed {
			s.mu.Unlock()
			return
		}
		b := s.queue[0]
		s.queue = s.queue[1:]
		s.mu.Unlock()
		if _, err := s.stdin.Write(b); err != nil {
			return
		}
	}
}

func (s *session) close() {
	s.mu.Lock()
	s.closed = true
	s.mu.Unlock()
	s.cond.Broadcast()
	s.s.Close()
}

// shell(clientId, { term, cols, rows, onData(Uint8Array), onExit(code) }) => Promise<sessionId>
func shell(this js.Value, args []js.Value) any {
	cid := arg(args, 0).Int()
	opts := arg(args, 1)
	return promise(func() (any, error) {
		cl, ok := clients.get(cid)
		if !ok {
			return nil, errNotFound
		}
		s, err := cl.ssh.NewSession()
		if err != nil {
			return nil, newCoded("ssh", "无法打开会话："+err.Error())
		}
		term := optString(opts, "term")
		if term == "" {
			term = "xterm-256color"
		}
		modes := ssh.TerminalModes{ssh.ECHO: 1, ssh.TTY_OP_ISPEED: 115200, ssh.TTY_OP_OSPEED: 115200}
		if err := s.RequestPty(term, optInt(opts, "rows", 24), optInt(opts, "cols", 80), modes); err != nil {
			s.Close()
			return nil, newCoded("ssh", "无法分配终端："+err.Error())
		}
		if env := opts.Get("env"); env.Type() == js.TypeObject {
			keys := jsObject.Call("keys", env)
			for i := 0; i < keys.Length(); i++ {
				k := keys.Index(i).String()
				_ = s.Setenv(k, env.Get(k).String()) // 服务器不允许时忽略
			}
		}
		stdin, _ := s.StdinPipe()
		stdout, _ := s.StdoutPipe()
		stderr, _ := s.StderrPipe()
		if err := s.Shell(); err != nil {
			s.Close()
			return nil, newCoded("ssh", "无法启动 Shell："+err.Error())
		}
		sess := &session{s: s, stdin: stdin}
		sess.cond = sync.NewCond(&sess.mu)
		id := sessionsReg.add(sess)
		cl.mu.Lock()
		cl.sessions[id] = true
		cl.mu.Unlock()
		go sess.writer()

		onData, _ := optFunc(opts, "onData")
		pump := func(r io.Reader) {
			buf := make([]byte, 32*1024)
			for {
				n, err := r.Read(buf)
				if n > 0 && onData.Type() == js.TypeFunction {
					onData.Invoke(toJSBytes(buf[:n]))
				}
				if err != nil {
					return
				}
			}
		}
		var wg sync.WaitGroup
		wg.Add(2)
		go func() { defer wg.Done(); pump(stdout) }()
		go func() { defer wg.Done(); pump(stderr) }()
		go func() {
			err := s.Wait()
			wg.Wait()
			code := 0
			var exit *ssh.ExitError
			if errors.As(err, &exit) {
				code = exit.ExitStatus()
			} else if err != nil {
				code = -1
			}
			sessionsReg.remove(id)
			cl.mu.Lock()
			delete(cl.sessions, id)
			cl.mu.Unlock()
			sess.close()
			if fn, ok := optFunc(opts, "onExit"); ok {
				fn.Invoke(code)
			}
		}()
		return id, nil
	})
}

// write(sessionId, data: Uint8Array | string)
func write(this js.Value, args []js.Value) any {
	s, ok := sessionsReg.get(arg(args, 0).Int())
	if !ok {
		return false
	}
	v := arg(args, 1)
	if v.Type() == js.TypeString {
		s.enqueue([]byte(v.String()))
	} else {
		s.enqueue(toBytes(v))
	}
	return true
}

// resize(sessionId, cols, rows)
func resize(this js.Value, args []js.Value) any {
	s, ok := sessionsReg.get(arg(args, 0).Int())
	if !ok {
		return false
	}
	cols, rows := arg(args, 1).Int(), arg(args, 2).Int()
	go s.s.WindowChange(rows, cols)
	return true
}

// closeSession(sessionId)
func closeSession(this js.Value, args []js.Value) any {
	if s, ok := sessionsReg.get(arg(args, 0).Int()); ok {
		s.close()
	}
	return nil
}

/* ---------------- 执行命令（监控、快捷命令等） ---------------- */

type limitedBuffer struct {
	buf   bytes.Buffer
	limit int
}

func (b *limitedBuffer) Write(p []byte) (int, error) {
	if room := b.limit - b.buf.Len(); room > 0 {
		if len(p) > room {
			b.buf.Write(p[:room])
		} else {
			b.buf.Write(p)
		}
	}
	return len(p), nil
}

// exec(clientId, command, { timeout = 30000, stdin? }) => Promise<{ stdout, stderr, code }>
// 输出各截取前 4 MB
func execCommand(this js.Value, args []js.Value) any {
	cid := arg(args, 0).Int()
	cmd := arg(args, 1).String()
	opts := arg(args, 2)
	return promise(func() (any, error) {
		cl, ok := clients.get(cid)
		if !ok {
			return nil, errNotFound
		}
		s, err := cl.ssh.NewSession()
		if err != nil {
			return nil, newCoded("ssh", "无法打开会话："+err.Error())
		}
		defer s.Close()
		stdout := &limitedBuffer{limit: 4 << 20}
		stderr := &limitedBuffer{limit: 4 << 20}
		s.Stdout, s.Stderr = stdout, stderr
		if in := optString(opts, "stdin"); in != "" {
			s.Stdin = strings.NewReader(in)
		}
		done := make(chan error, 1)
		go func() { done <- s.Run(cmd) }()
		timeout := time.Duration(optInt(opts, "timeout", 30000)) * time.Millisecond
		var runErr error
		select {
		case runErr = <-done:
		case <-time.After(timeout):
			s.Signal(ssh.SIGKILL)
			s.Close()
			return nil, newCoded("timeout", fmt.Sprintf("命令执行超过 %d 秒", int(timeout.Seconds())))
		}
		code := 0
		var exit *ssh.ExitError
		var missing *ssh.ExitMissingError
		switch {
		case errors.As(runErr, &exit):
			code = exit.ExitStatus()
		case errors.As(runErr, &missing):
			code = -1
		case runErr != nil:
			return nil, newCoded("ssh", runErr.Error())
		}
		return object(map[string]any{
			"stdout": stdout.buf.String(),
			"stderr": stderr.buf.String(),
			"code":   code,
		}), nil
	})
}
