//go:build js && wasm

package main

import (
	"errors"
	"fmt"
	"sync"
	"syscall/js"
)

var (
	jsObject     = js.Global().Get("Object")
	jsArray      = js.Global().Get("Array")
	jsUint8Array = js.Global().Get("Uint8Array")
	jsPromise    = js.Global().Get("Promise")
	jsError      = js.Global().Get("Error")
)

// promise 在 goroutine 里执行 fn，返回 JS Promise；fn 返回的 error 变成 reject 的 Error 对象
func promise(fn func() (any, error)) js.Value {
	var executor js.Func
	executor = js.FuncOf(func(this js.Value, args []js.Value) any {
		resolve, reject := args[0], args[1]
		go func() {
			defer func() {
				if r := recover(); r != nil {
					reject.Invoke(jsErr(fmt.Errorf("内部错误：%v", r)))
				}
			}()
			v, err := fn()
			if err != nil {
				reject.Invoke(jsErr(err))
				return
			}
			resolve.Invoke(v)
		}()
		return nil
	})
	p := jsPromise.New(executor)
	executor.Release()
	return p
}

func jsErr(err error) js.Value {
	e := jsError.New(err.Error())
	var coded *codedError
	if errors.As(err, &coded) {
		e.Set("code", coded.code)
	}
	return e
}

// codedError 带一个机器可读的错误码，前端据此给出对应提示（如 auth、hostkey、timeout）
type codedError struct {
	code string
	msg  string
}

func (e *codedError) Error() string { return e.msg }

func newCoded(code, msg string) error { return &codedError{code: code, msg: msg} }

// await 等待 JS Promise（或普通值），只能在 goroutine 中调用，不能在 JS 回调里直接调用
func await(v js.Value) (js.Value, error) {
	if v.Type() != js.TypeObject || v.Get("then").Type() != js.TypeFunction {
		return v, nil
	}
	type result struct {
		v   js.Value
		err error
	}
	ch := make(chan result, 1)
	var onOk, onErr js.Func
	onOk = js.FuncOf(func(this js.Value, args []js.Value) any {
		var r js.Value
		if len(args) > 0 {
			r = args[0]
		}
		ch <- result{v: r}
		return nil
	})
	onErr = js.FuncOf(func(this js.Value, args []js.Value) any {
		msg := "操作被取消"
		if len(args) > 0 && args[0].Type() == js.TypeObject && args[0].Get("message").Type() == js.TypeString {
			msg = args[0].Get("message").String()
		}
		ch <- result{err: errors.New(msg)}
		return nil
	})
	v.Call("then", onOk, onErr)
	r := <-ch
	onOk.Release()
	onErr.Release()
	return r.v, r.err
}

func toBytes(v js.Value) []byte {
	if v.Type() != js.TypeObject {
		return nil
	}
	b := make([]byte, v.Get("byteLength").Int())
	js.CopyBytesToGo(b, v)
	return b
}

func toJSBytes(b []byte) js.Value {
	arr := jsUint8Array.New(len(b))
	js.CopyBytesToJS(arr, b)
	return arr
}

func optString(o js.Value, key string) string {
	if o.Type() != js.TypeObject {
		return ""
	}
	v := o.Get(key)
	if v.Type() != js.TypeString {
		return ""
	}
	return v.String()
}

func optInt(o js.Value, key string, def int) int {
	if o.Type() != js.TypeObject {
		return def
	}
	v := o.Get(key)
	if v.Type() != js.TypeNumber {
		return def
	}
	return v.Int()
}

func optBool(o js.Value, key string) bool {
	return o.Type() == js.TypeObject && o.Get(key).Truthy()
}

func optFunc(o js.Value, key string) (js.Value, bool) {
	if o.Type() != js.TypeObject {
		return js.Undefined(), false
	}
	v := o.Get(key)
	return v, v.Type() == js.TypeFunction
}

func arg(args []js.Value, i int) js.Value {
	if i < len(args) {
		return args[i]
	}
	return js.Undefined()
}

func object(kv map[string]any) js.Value {
	o := jsObject.New()
	for k, v := range kv {
		o.Set(k, v)
	}
	return o
}

// registry 用整数 id 在 JS 与 Go 之间引用连接、会话、文件句柄等对象
type registry[T any] struct {
	mu   sync.Mutex
	next int
	m    map[int]T
}

func newRegistry[T any]() *registry[T] {
	return &registry[T]{m: map[int]T{}}
}

func (r *registry[T]) add(v T) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.next++
	r.m[r.next] = v
	return r.next
}

func (r *registry[T]) get(id int) (T, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	v, ok := r.m[id]
	return v, ok
}

func (r *registry[T]) remove(id int) (T, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	v, ok := r.m[id]
	delete(r.m, id)
	return v, ok
}

func (r *registry[T]) each(fn func(id int, v T)) {
	r.mu.Lock()
	items := make(map[int]T, len(r.m))
	for k, v := range r.m {
		items[k] = v
	}
	r.mu.Unlock()
	for k, v := range items {
		fn(k, v)
	}
}

var errNotFound = newCoded("closed", "连接已关闭")
