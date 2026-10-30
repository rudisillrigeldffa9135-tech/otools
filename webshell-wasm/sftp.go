//go:build js && wasm

package main

import (
	"errors"
	"io"
	"os"
	"path"
	"strings"
	"syscall/js"

	"github.com/pkg/sftp"
)

var (
	sftpReg  = newRegistry[*sftp.Client]()
	filesReg = newRegistry[*sftp.File]()
)

func sftpErr(err error) error {
	if err == nil {
		return nil
	}
	var se *sftp.StatusError
	switch {
	case errors.Is(err, os.ErrNotExist):
		return newCoded("notfound", "文件或目录不存在")
	case errors.Is(err, os.ErrPermission):
		return newCoded("permission", "没有权限")
	case errors.Is(err, os.ErrExist):
		return newCoded("exists", "已存在同名文件或目录")
	case errors.As(err, &se) && se.FxCode() == sftp.ErrSSHFxFailure:
		return newCoded("failure", "操作失败（目录非空、磁盘已满或不支持该操作）")
	}
	return newCoded("sftp", err.Error())
}

func getSftp(id int) (*sftp.Client, error) {
	c, ok := sftpReg.get(id)
	if !ok {
		return nil, errNotFound
	}
	return c, nil
}

func statObject(name string, fi os.FileInfo) js.Value {
	o := map[string]any{
		"name":   name,
		"size":   float64(fi.Size()),
		"mode":   int(fi.Mode().Perm()),
		"perm":   fi.Mode().String(),
		"isDir":  fi.IsDir(),
		"isLink": fi.Mode()&os.ModeSymlink != 0,
		"mtime":  float64(fi.ModTime().Unix()),
	}
	if st, ok := fi.Sys().(*sftp.FileStat); ok {
		o["uid"] = int(st.UID)
		o["gid"] = int(st.GID)
	}
	return object(o)
}

// sftpOpen(clientId) => Promise<sftpId>
func sftpOpen(this js.Value, args []js.Value) any {
	cid := arg(args, 0).Int()
	return promise(func() (any, error) {
		cl, ok := clients.get(cid)
		if !ok {
			return nil, errNotFound
		}
		c, err := sftp.NewClient(cl.ssh, sftp.UseConcurrentReads(true), sftp.UseConcurrentWrites(true))
		if err != nil {
			return nil, newCoded("sftp", "服务器未开启 SFTP："+err.Error())
		}
		id := sftpReg.add(c)
		cl.mu.Lock()
		cl.sftps[id] = true
		cl.mu.Unlock()
		return id, nil
	})
}

// sftpClose(sftpId)
func sftpClose(this js.Value, args []js.Value) any {
	if c, ok := sftpReg.remove(arg(args, 0).Int()); ok {
		c.Close()
	}
	return nil
}

// sftpList(sftpId, dir) => Promise<Entry[]>；符号链接会解析目标，isDir 表示目标是否为目录
func sftpList(this js.Value, args []js.Value) any {
	id, dir := arg(args, 0).Int(), arg(args, 1).String()
	return promise(func() (any, error) {
		c, err := getSftp(id)
		if err != nil {
			return nil, err
		}
		list, err := c.ReadDir(dir)
		if err != nil {
			return nil, sftpErr(err)
		}
		out := jsArray.New()
		for _, fi := range list {
			o := statObject(fi.Name(), fi)
			if fi.Mode()&os.ModeSymlink != 0 {
				full := path.Join(dir, fi.Name())
				if target, err := c.Stat(full); err == nil {
					o.Set("isDir", target.IsDir())
					o.Set("size", float64(target.Size()))
				}
				if link, err := c.ReadLink(full); err == nil {
					o.Set("linkTarget", link)
				}
			}
			out.Call("push", o)
		}
		return out, nil
	})
}

// sftpStat(sftpId, path) => Promise<Entry>（跟随符号链接）
func sftpStat(this js.Value, args []js.Value) any {
	id, p := arg(args, 0).Int(), arg(args, 1).String()
	return promise(func() (any, error) {
		c, err := getSftp(id)
		if err != nil {
			return nil, err
		}
		fi, err := c.Stat(p)
		if err != nil {
			return nil, sftpErr(err)
		}
		return statObject(path.Base(p), fi), nil
	})
}

// sftpRealpath(sftpId, path) => Promise<string>；传 "." 得到登录用户的主目录
func sftpRealpath(this js.Value, args []js.Value) any {
	id, p := arg(args, 0).Int(), arg(args, 1).String()
	return promise(func() (any, error) {
		c, err := getSftp(id)
		if err != nil {
			return nil, err
		}
		r, err := c.RealPath(p)
		if err != nil {
			return nil, sftpErr(err)
		}
		return r, nil
	})
}

// sftpMkdir(sftpId, path, parents)
func sftpMkdir(this js.Value, args []js.Value) any {
	id, p, parents := arg(args, 0).Int(), arg(args, 1).String(), arg(args, 2).Truthy()
	return promise(func() (any, error) {
		c, err := getSftp(id)
		if err != nil {
			return nil, err
		}
		if parents {
			return nil, sftpErr(c.MkdirAll(p))
		}
		return nil, sftpErr(c.Mkdir(p))
	})
}

// sftpRemove(sftpId, path, recursive)
func sftpRemove(this js.Value, args []js.Value) any {
	id, p, recursive := arg(args, 0).Int(), arg(args, 1).String(), arg(args, 2).Truthy()
	return promise(func() (any, error) {
		c, err := getSftp(id)
		if err != nil {
			return nil, err
		}
		fi, err := c.Lstat(p)
		if err != nil {
			return nil, sftpErr(err)
		}
		if !fi.IsDir() {
			return nil, sftpErr(c.Remove(p))
		}
		if recursive {
			return nil, sftpErr(removeAll(c, p))
		}
		return nil, sftpErr(c.RemoveDirectory(p))
	})
}

// 递归删除：不跟随符号链接，只删除链接本身
func removeAll(c *sftp.Client, p string) error {
	list, err := c.ReadDir(p)
	if err != nil {
		return err
	}
	for _, fi := range list {
		full := path.Join(p, fi.Name())
		if fi.IsDir() {
			if err := removeAll(c, full); err != nil {
				return err
			}
		} else if err := c.Remove(full); err != nil {
			return err
		}
	}
	return c.RemoveDirectory(p)
}

// sftpRename(sftpId, from, to)；优先用 posix-rename（可覆盖目标）
func sftpRename(this js.Value, args []js.Value) any {
	id, from, to := arg(args, 0).Int(), arg(args, 1).String(), arg(args, 2).String()
	return promise(func() (any, error) {
		c, err := getSftp(id)
		if err != nil {
			return nil, err
		}
		if err := c.PosixRename(from, to); err == nil {
			return nil, nil
		}
		return nil, sftpErr(c.Rename(from, to))
	})
}

// sftpChmod(sftpId, path, mode)
func sftpChmod(this js.Value, args []js.Value) any {
	id, p, mode := arg(args, 0).Int(), arg(args, 1).String(), arg(args, 2).Int()
	return promise(func() (any, error) {
		c, err := getSftp(id)
		if err != nil {
			return nil, err
		}
		return nil, sftpErr(c.Chmod(p, os.FileMode(mode)))
	})
}

// sftpOpenRead(sftpId, path) => Promise<{ id, size }>
func sftpOpenRead(this js.Value, args []js.Value) any {
	id, p := arg(args, 0).Int(), arg(args, 1).String()
	return promise(func() (any, error) {
		c, err := getSftp(id)
		if err != nil {
			return nil, err
		}
		f, err := c.Open(p)
		if err != nil {
			return nil, sftpErr(err)
		}
		fi, err := f.Stat()
		if err != nil {
			f.Close()
			return nil, sftpErr(err)
		}
		if fi.IsDir() {
			f.Close()
			return nil, newCoded("isdir", "这是一个目录")
		}
		return object(map[string]any{"id": filesReg.add(f), "size": float64(fi.Size())}), nil
	})
}

// sftpOpenWrite(sftpId, path, append) => Promise<fileId>；默认覆盖已有文件
func sftpOpenWrite(this js.Value, args []js.Value) any {
	id, p, appendMode := arg(args, 0).Int(), arg(args, 1).String(), arg(args, 2).Truthy()
	return promise(func() (any, error) {
		c, err := getSftp(id)
		if err != nil {
			return nil, err
		}
		flags := os.O_WRONLY | os.O_CREATE
		if appendMode {
			flags |= os.O_APPEND
		} else {
			flags |= os.O_TRUNC
		}
		f, err := c.OpenFile(p, flags)
		if err != nil {
			return nil, sftpErr(err)
		}
		return filesReg.add(f), nil
	})
}

// sftpRead(fileId, size) => Promise<Uint8Array | null>；读完返回 null
func sftpRead(this js.Value, args []js.Value) any {
	id, size := arg(args, 0).Int(), arg(args, 1).Int()
	return promise(func() (any, error) {
		f, ok := filesReg.get(id)
		if !ok {
			return nil, errNotFound
		}
		if size <= 0 || size > 4<<20 {
			size = 256 << 10
		}
		buf := make([]byte, size)
		n, err := io.ReadFull(f, buf)
		if n > 0 {
			return toJSBytes(buf[:n]), nil
		}
		if err == io.EOF || err == io.ErrUnexpectedEOF {
			return js.Null(), nil
		}
		return nil, sftpErr(err)
	})
}

// sftpWrite(fileId, data: Uint8Array) => Promise<void>
func sftpWrite(this js.Value, args []js.Value) any {
	id := arg(args, 0).Int()
	data := toBytes(arg(args, 1))
	return promise(func() (any, error) {
		f, ok := filesReg.get(id)
		if !ok {
			return nil, errNotFound
		}
		_, err := f.Write(data)
		return nil, sftpErr(err)
	})
}

// sftpCloseFile(fileId) => Promise<void>
func sftpCloseFile(this js.Value, args []js.Value) any {
	id := arg(args, 0).Int()
	return promise(func() (any, error) {
		f, ok := filesReg.remove(id)
		if !ok {
			return nil, nil
		}
		if err := f.Close(); err != nil && !strings.Contains(err.Error(), "closed") {
			return nil, sftpErr(err)
		}
		return nil, nil
	})
}
