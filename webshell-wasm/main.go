//go:build js && wasm

// WebShell 的浏览器端 SSH / SFTP 客户端（编译为 WebAssembly）。
//
// SSH 协议的加解密全部在浏览器里完成：Worker 只负责把 WebSocket 与服务器的 TCP 连接对接，
// 看到的只有加密后的字节流，拿不到密码、私钥和终端内容。
//
// 对 JS 暴露全局对象 globalThis.__otssh（见 src/pages-tools/webshell/lib/ssh.ts 的类型声明）。
package main

import (
	"syscall/js"
)

func main() {
	api := js.Global().Get("Object").New()
	fns := map[string]func(this js.Value, args []js.Value) any{
		"createTransport": createTransport,
		"connect":         connect,
		"disconnect":      disconnect,
		"shell":           shell,
		"write":           write,
		"resize":          resize,
		"closeSession":    closeSession,
		"exec":            execCommand,
		"sftpOpen":        sftpOpen,
		"sftpClose":       sftpClose,
		"sftpList":        sftpList,
		"sftpStat":        sftpStat,
		"sftpRealpath":    sftpRealpath,
		"sftpMkdir":       sftpMkdir,
		"sftpRemove":      sftpRemove,
		"sftpRename":      sftpRename,
		"sftpChmod":       sftpChmod,
		"sftpOpenRead":    sftpOpenRead,
		"sftpOpenWrite":   sftpOpenWrite,
		"sftpRead":        sftpRead,
		"sftpWrite":       sftpWrite,
		"sftpCloseFile":   sftpCloseFile,
		"generateKey":     generateKey,
		"parseKey":        parseKey,
	}
	for name, fn := range fns {
		api.Set(name, js.FuncOf(fn))
	}
	api.Set("version", "1")
	js.Global().Set("__otssh", api)
	if ready := js.Global().Get("__otsshReady"); ready.Type() == js.TypeFunction {
		ready.Invoke()
	}
	select {}
}
