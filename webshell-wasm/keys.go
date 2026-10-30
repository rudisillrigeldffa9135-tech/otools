//go:build js && wasm

package main

import (
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"encoding/pem"
	"strings"
	"syscall/js"

	"golang.org/x/crypto/ssh"
)

func keyInfo(pub ssh.PublicKey, comment string) map[string]any {
	line := strings.TrimSpace(string(ssh.MarshalAuthorizedKey(pub)))
	if comment != "" {
		line += " " + comment
	}
	return map[string]any{
		"type":        pub.Type(),
		"publicKey":   line,
		"fingerprint": ssh.FingerprintSHA256(pub),
	}
}

// generateKey(type: 'ed25519' | 'rsa' | 'ecdsa', comment) => Promise<{ privateKey, publicKey, fingerprint, type }>
// 私钥为 OpenSSH 格式（不加密，存入密钥库时由主密码端到端加密）
func generateKey(this js.Value, args []js.Value) any {
	kind, comment := arg(args, 0).String(), arg(args, 1).String()
	return promise(func() (any, error) {
		var priv any
		var err error
		switch kind {
		case "rsa":
			priv, err = rsa.GenerateKey(rand.Reader, 4096)
		case "ecdsa":
			priv, err = ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		default:
			_, priv, err = ed25519.GenerateKey(rand.Reader)
		}
		if err != nil {
			return nil, err
		}
		block, err := ssh.MarshalPrivateKey(priv, comment)
		if err != nil {
			return nil, err
		}
		signer, err := ssh.NewSignerFromKey(priv)
		if err != nil {
			return nil, err
		}
		info := keyInfo(signer.PublicKey(), comment)
		info["privateKey"] = string(pem.EncodeToMemory(block))
		return object(info), nil
	})
}

// parseKey(pem, passphrase) => Promise<{ type, publicKey, fingerprint }>
// 私钥需要密码时 reject，错误码 passphrase
func parseKey(this js.Value, args []js.Value) any {
	text, passphrase := arg(args, 0).String(), ""
	if p := arg(args, 1); p.Type() == js.TypeString {
		passphrase = p.String()
	}
	return promise(func() (any, error) {
		signer, err := parseSigner(text, passphrase)
		if err != nil {
			return nil, err
		}
		return object(keyInfo(signer.PublicKey(), "")), nil
	})
}
