//go:build js && wasm

package main

import (
	"io"
	"net"
	"sync"
	"syscall/js"
	"time"
)

// jsConn 把 JS 侧的 WebSocket 包装成 net.Conn：
// JS 收到数据时调用 push 放入队列，Go 的 SSH 握手与读取从队列里取；Go 写出的数据交给 JS 的 send 回调发出。
// 队列不设上限，避免在 JS 回调里阻塞事件循环。
type jsConn struct {
	send    js.Value
	onClose js.Value

	mu     sync.Mutex
	cond   *sync.Cond
	chunks [][]byte
	closed bool
	cur    []byte

	readDeadline time.Time
}

var transports = newRegistry[*jsConn]()

func newJSConn(send, onClose js.Value) *jsConn {
	c := &jsConn{send: send, onClose: onClose}
	c.cond = sync.NewCond(&c.mu)
	return c
}

// createTransport(send: (data: Uint8Array) => void, close: () => void) => { id, push(data), end() }
// push / end 是同步函数，供 WebSocket 的 onmessage / onclose 直接调用
func createTransport(this js.Value, args []js.Value) any {
	c := newJSConn(arg(args, 0), arg(args, 1))
	id := transports.add(c)
	push := js.FuncOf(func(this js.Value, a []js.Value) any {
		c.push(toBytes(arg(a, 0)))
		return nil
	})
	var end js.Func
	end = js.FuncOf(func(this js.Value, a []js.Value) any {
		c.markClosed()
		transports.remove(id)
		push.Release()
		end.Release()
		return nil
	})
	return object(map[string]any{"id": id, "push": push, "end": end})
}

func (c *jsConn) push(b []byte) {
	if len(b) == 0 {
		return
	}
	c.mu.Lock()
	if !c.closed {
		c.chunks = append(c.chunks, b)
	}
	c.mu.Unlock()
	c.cond.Broadcast()
}

func (c *jsConn) markClosed() {
	c.mu.Lock()
	c.closed = true
	c.mu.Unlock()
	c.cond.Broadcast()
}

func (c *jsConn) Read(p []byte) (int, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for len(c.cur) == 0 {
		if len(c.chunks) > 0 {
			c.cur = c.chunks[0]
			c.chunks[0] = nil
			c.chunks = c.chunks[1:]
			break
		}
		if c.closed {
			return 0, io.EOF
		}
		if !c.readDeadline.IsZero() && time.Now().After(c.readDeadline) {
			return 0, newCoded("timeout", "连接超时")
		}
		c.cond.Wait()
	}
	n := copy(p, c.cur)
	c.cur = c.cur[n:]
	return n, nil
}

func (c *jsConn) Write(p []byte) (int, error) {
	c.mu.Lock()
	closed := c.closed
	c.mu.Unlock()
	if closed {
		return 0, io.ErrClosedPipe
	}
	c.send.Invoke(toJSBytes(p))
	return len(p), nil
}

func (c *jsConn) Close() error {
	c.mu.Lock()
	already := c.closed
	c.closed = true
	c.mu.Unlock()
	c.cond.Broadcast()
	if !already && c.onClose.Type() == js.TypeFunction {
		c.onClose.Invoke()
	}
	return nil
}

func (c *jsConn) SetReadDeadline(t time.Time) error {
	c.mu.Lock()
	c.readDeadline = t
	c.mu.Unlock()
	if !t.IsZero() {
		// 到期时唤醒等待中的 Read
		time.AfterFunc(time.Until(t)+10*time.Millisecond, func() { c.cond.Broadcast() })
	}
	return nil
}

func (c *jsConn) SetDeadline(t time.Time) error      { return c.SetReadDeadline(t) }
func (c *jsConn) SetWriteDeadline(t time.Time) error { return nil }
func (c *jsConn) LocalAddr() net.Addr                { return wsAddr{} }
func (c *jsConn) RemoteAddr() net.Addr               { return wsAddr{} }

type wsAddr struct{}

func (wsAddr) Network() string { return "websocket" }
func (wsAddr) String() string  { return "websocket" }
